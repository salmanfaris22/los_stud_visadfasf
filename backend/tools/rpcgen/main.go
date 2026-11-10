// Command rpcgen writes the lms.v1 service protos and their Go adapters from spec.txt.
//
// One spec line describes one RPC: access rule, request fields, response shape and the
// service call. Run from backend/: go run ./tools/rpcgen && make -C .. proto
// Hand-written services (auth, course versions, server monitor) are not in the spec.
package main

import (
	"bufio"
	"bytes"
	"fmt"
	"go/format"
	"os"
	"regexp"
	"sort"
	"strings"
)

type service struct {
	name, file, doc string
	rpcs            []*rpc
}

type rpc struct {
	name, summary string
	access        string // proto option body
	get, stream   bool
	fields        []fieldSpec
	resp          string
	call          string
}

type fieldSpec struct {
	name, kind, typ string // kind: uuid optuuid uuids str i32 bool ts msg page
	rules           map[string]string
	required        bool
}

func main() {
	f, err := os.Open("tools/rpcgen/spec.txt")
	must(err)
	defer f.Close()
	var svcs []*service
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	line := 0
	for sc.Scan() {
		line++
		t := strings.TrimSpace(sc.Text())
		if t == "" || strings.HasPrefix(t, "#") {
			continue
		}
		if strings.HasPrefix(t, "service ") {
			parts := strings.SplitN(t, " ", 4)
			svcs = append(svcs, &service{name: parts[1], file: parts[2], doc: strings.Trim(parts[3], `"`)})
			continue
		}
		r, err := parseRPC(t)
		if err != nil {
			panic(fmt.Sprintf("spec.txt:%d: %v", line, err))
		}
		svcs[len(svcs)-1].rpcs = append(svcs[len(svcs)-1].rpcs, r)
	}
	must(sc.Err())
	for _, s := range svcs {
		writeProto(s)
	}
	writeGo(svcs)
}

func parseRPC(t string) (*rpc, error) {
	seg := strings.Split(t, " | ")
	if len(seg) != 5 {
		return nil, fmt.Errorf("want 5 segments, got %d", len(seg))
	}
	head := strings.Fields(seg[0])
	r := &rpc{name: head[0], resp: strings.TrimSpace(seg[2]), call: strings.TrimSpace(seg[3]), summary: strings.TrimSpace(seg[4])}
	var rule, rl string
	for _, tok := range head[1:] {
		switch {
		case tok == "get":
			r.get = true
		case tok == "stream":
			r.stream = true
		case tok == "public":
			rule = "public: true"
		case tok == "signed":
			rule = "signed_in: true"
		case tok == "student":
			rule = "student: true"
		case tok == "staff":
			rule = "staff: true"
		case strings.HasPrefix(tok, "perm:"):
			ma := strings.SplitN(strings.TrimPrefix(tok, "perm:"), ".", 2)
			rule = fmt.Sprintf("perm: {module: %q, action: %q}", ma[0], ma[1])
		case strings.HasPrefix(tok, "rl="):
			p := strings.Split(strings.TrimPrefix(tok, "rl="), "/")
			rl = fmt.Sprintf("rate_limit: {bucket: %q, limit: %s, window_seconds: %s}", p[0], p[1], p[2])
		default:
			return nil, fmt.Errorf("unknown token %q", tok)
		}
	}
	if rule == "" {
		return nil, fmt.Errorf("%s has no access rule", r.name)
	}
	r.access = rule
	if rl != "" {
		r.access += ", " + rl
	}
	fs := strings.TrimSpace(seg[1])
	if fs != "-" {
		for _, tok := range strings.Fields(fs) {
			f, err := parseField(tok)
			if err != nil {
				return nil, err
			}
			r.fields = append(r.fields, f)
		}
	}
	return r, nil
}

var fieldRe = regexp.MustCompile(`^([a-z_]+)(?::([A-Za-z0-9]+)(\?|!)?(?:\[([^\]]*)\])?)?$`)

func parseField(tok string) (fieldSpec, error) {
	if tok == "id" {
		return fieldSpec{name: "id", kind: "uuid", required: true}, nil
	}
	if tok == "page" {
		return fieldSpec{name: "page", kind: "page"}, nil
	}
	m := fieldRe.FindStringSubmatch(tok)
	if m == nil || m[2] == "" {
		return fieldSpec{}, fmt.Errorf("bad field %q", tok)
	}
	f := fieldSpec{name: m[1], typ: m[2], rules: map[string]string{}, required: m[3] == "!"}
	if m[4] != "" {
		for _, kv := range strings.Split(m[4], ",") {
			p := strings.SplitN(kv, "=", 2)
			if len(p) == 1 {
				f.rules[p[0]] = ""
			} else {
				f.rules[p[0]] = p[1]
			}
		}
	}
	switch m[2] {
	case "uuid":
		f.kind = "uuid"
		f.required = true
		if m[3] == "?" {
			f.kind, f.required = "optuuid", false
		}
	case "uuids", "str", "i32", "bool", "ts":
		f.kind = m[2]
	default:
		f.kind = "msg"
		f.required = true
	}
	return f, nil
}

// ── proto ──

const uuidOrEmpty = `^(|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$`

var commonTypes = map[string]bool{"Person": true, "File": true, "PageInfo": true}

func writeProto(s *service) {
	var body bytes.Buffer
	uses := map[string]bool{"lms/v1/options.proto": true}
	fmt.Fprintf(&body, "// %s\nservice %s {\n", s.doc, s.name)
	for _, r := range s.rpcs {
		ret := r.name + "Response"
		if r.stream {
			ret = "stream " + ret
		}
		fmt.Fprintf(&body, "  // %s\n  rpc %s(%sRequest) returns (%s) {\n    option (lms.v1.access) = {%s};\n", r.summary, r.name, r.name, ret, r.access)
		if r.get {
			body.WriteString("    option idempotency_level = NO_SIDE_EFFECTS;\n")
		}
		body.WriteString("  }\n")
	}
	body.WriteString("}\n")

	useType := func(t string) {
		switch {
		case commonTypes[t]:
			uses["lms/v1/common.proto"] = true
		case strings.HasPrefix(t, "google.protobuf.Timestamp"):
			uses["google/protobuf/timestamp.proto"] = true
		case strings.HasPrefix(t, "google.protobuf."):
			uses["google/protobuf/struct.proto"] = true
		default:
			uses["lms/v1/types.proto"] = true
		}
	}

	for _, r := range s.rpcs {
		fmt.Fprintf(&body, "\nmessage %sRequest {", r.name)
		n := 0
		if len(r.fields) == 0 {
			body.WriteString("}\n")
		} else {
			body.WriteString("\n")
			for _, f := range r.fields {
				for _, l := range protoField(f, &n, useType, uses) {
					body.WriteString("  " + l + "\n")
				}
			}
			body.WriteString("}\n")
		}
		fmt.Fprintf(&body, "\nmessage %sResponse {", r.name)
		lines := respFields(r.resp, useType)
		if len(lines) == 0 {
			body.WriteString("}\n")
		} else {
			body.WriteString("\n")
			for _, l := range lines {
				body.WriteString("  " + l + "\n")
			}
			body.WriteString("}\n")
		}
	}

	var imports []string
	for k := range uses {
		imports = append(imports, k)
	}
	sort.Strings(imports)
	var b bytes.Buffer
	b.WriteString("// Code generated by backend/tools/rpcgen from spec.txt. DO NOT EDIT.\nsyntax = \"proto3\";\n\npackage lms.v1;\n\n")
	for _, i := range imports {
		fmt.Fprintf(&b, "import %q;\n", i)
	}
	b.WriteString("\n")
	b.Write(body.Bytes())
	must(os.WriteFile("../proto/lms/v1/"+s.file+".proto", b.Bytes(), 0o644))
}

func protoField(f fieldSpec, n *int, useType func(string), uses map[string]bool) []string {
	next := func() int { *n++; return *n }
	validate := func() { uses["buf/validate/validate.proto"] = true }
	switch f.kind {
	case "page":
		validate()
		return []string{
			fmt.Sprintf("int32 page = %d [(buf.validate.field).int32.gte = 0];", next()),
			fmt.Sprintf("int32 per_page = %d [(buf.validate.field).int32 = {gte: 0, lte: 200}];", next()),
		}
	case "uuid":
		validate()
		return []string{fmt.Sprintf("string %s = %d [(buf.validate.field).string.uuid = true];", f.name, next())}
	case "optuuid":
		validate()
		return []string{fmt.Sprintf("string %s = %d [(buf.validate.field).string.pattern = %q];", f.name, next(), uuidOrEmpty)}
	case "uuids":
		validate()
		r := []string{"items: {string: {uuid: true}}"}
		if v, ok := f.rules["min"]; ok {
			r = append([]string{"min_items: " + v}, r...)
		}
		if v, ok := f.rules["max"]; ok {
			r = append([]string{"max_items: " + v}, r...)
		}
		return []string{fmt.Sprintf("repeated string %s = %d [(buf.validate.field).repeated = {%s}];", f.name, next(), strings.Join(r, ", "))}
	case "str":
		var r []string
		if v, ok := f.rules["min"]; ok {
			r = append(r, "min_len: "+v)
		}
		if v, ok := f.rules["max"]; ok {
			r = append(r, "max_len: "+v)
		}
		if v, ok := f.rules["in"]; ok {
			var q []string
			for _, x := range strings.Split(v, "/") {
				q = append(q, fmt.Sprintf("%q", x))
			}
			r = append(r, "in: ["+strings.Join(q, ", ")+"]")
		}
		if len(r) == 0 {
			return []string{fmt.Sprintf("string %s = %d;", f.name, next())}
		}
		validate()
		opt := fmt.Sprintf("[(buf.validate.field).string = {%s}", strings.Join(r, ", "))
		if !f.required {
			opt += ", (buf.validate.field).ignore = IGNORE_IF_ZERO_VALUE"
		}
		return []string{fmt.Sprintf("string %s = %d %s];", f.name, next(), opt)}
	case "i32":
		var r []string
		for _, k := range []string{"gte", "lte"} {
			if v, ok := f.rules[k]; ok {
				r = append(r, k+": "+v)
			}
		}
		if len(r) == 0 {
			return []string{fmt.Sprintf("int32 %s = %d;", f.name, next())}
		}
		validate()
		return []string{fmt.Sprintf("int32 %s = %d [(buf.validate.field).int32 = {%s}, (buf.validate.field).ignore = IGNORE_IF_ZERO_VALUE];", f.name, next(), strings.Join(r, ", "))}
	case "bool":
		return []string{fmt.Sprintf("bool %s = %d;", f.name, next())}
	case "ts":
		useType("google.protobuf.Timestamp")
		return []string{fmt.Sprintf("google.protobuf.Timestamp %s = %d;", f.name, next())}
	case "msg":
		validate()
		useType(f.typ)
		return []string{fmt.Sprintf("%s %s = %d [(buf.validate.field).required = true];", f.typ, f.name, next())}
	}
	panic("unknown kind " + f.kind)
}

func respFields(resp string, useType func(string)) []string {
	switch {
	case resp == "-":
		return nil
	case resp == "ok" || resp == "okv" || strings.HasPrefix(resp, "ok="):
		return []string{"bool ok = 1;", "string message = 2;"}
	case resp == "strs":
		return []string{"repeated string items = 1;"}
	case resp == "file":
		useType("File")
		return []string{"File file = 1;"}
	case strings.HasPrefix(resp, "item:"):
		p := strings.Split(resp, ":")
		useType(p[2])
		return []string{fmt.Sprintf("%s %s = 1;", p[2], p[1])}
	case strings.HasPrefix(resp, "items:"):
		t := strings.TrimPrefix(resp, "items:")
		useType(t)
		return []string{fmt.Sprintf("repeated %s items = 1;", t)}
	case strings.HasPrefix(resp, "list:"):
		t := strings.TrimPrefix(resp, "list:")
		useType(t)
		return []string{fmt.Sprintf("repeated %s items = 1;", t), "int32 total = 2;", "int32 page = 3;", "int32 per_page = 4;"}
	case strings.HasPrefix(resp, "custom{"):
		var out []string
		for _, d := range strings.Split(strings.TrimSuffix(strings.TrimPrefix(resp, "custom{"), "}"), ";") {
			d = strings.TrimSpace(d)
			if d == "" {
				continue
			}
			for _, w := range strings.Fields(d) {
				if strings.HasPrefix(w, "google.protobuf.") || (len(w) > 0 && w[0] >= 'A' && w[0] <= 'Z') {
					useType(w)
				}
			}
			out = append(out, d+";")
		}
		return out
	}
	panic("unknown response " + resp)
}

// ── Go ──

func writeGo(svcs []*service) {
	var b bytes.Buffer
	b.WriteString(`// Code generated by backend/tools/rpcgen from spec.txt. DO NOT EDIT.

package rpc

import (
	"context"
	"net/http"

	"connectrpc.com/connect"

	lmsv1 "github.com/lms/backend/gen/lms/v1"
	"github.com/lms/backend/gen/lms/v1/lmsv1connect"
	"github.com/lms/backend/internal/dto"
)

var _ = dto.OK{}

// genMounts lists the generated services.
func (srv *server) genMounts() []mount {
	return []mount{
`)
	for _, s := range svcs {
		fmt.Fprintf(&b, "\t\t{lmsv1connect.%sName, func(o ...connect.HandlerOption) (string, http.Handler) {\n\t\t\treturn lmsv1connect.New%sHandler(%s{srv}, o...)\n\t\t}},\n", s.name, s.name, recv(s))
	}
	b.WriteString("\t}\n}\n")

	for _, s := range svcs {
		fmt.Fprintf(&b, "\n// %s implements lms.v1.%s.\ntype %s struct{ *server }\n", recv(s), s.name, recv(s))
		for _, r := range s.rpcs {
			if r.call == "custom" {
				continue
			}
			b.WriteString(goMethod(s, r))
		}
	}
	out, err := format.Source(b.Bytes())
	if err != nil {
		os.WriteFile("internal/rpc/services_gen.go", b.Bytes(), 0o644)
		panic(err)
	}
	must(os.WriteFile("internal/rpc/services_gen.go", out, 0o644))
}

func recv(s *service) string {
	return strings.ToLower(s.name[:1]) + strings.TrimSuffix(s.name[1:], "Service") + "Server"
}

func goMethod(s *service, r *rpc) string {
	call := r.call
	if c := call[0]; c >= 'A' && c <= 'Z' {
		call = "c.s." + call
	}
	var b bytes.Buffer
	fmt.Fprintf(&b, "\n// %s: %s\nfunc (c %s) %s(ctx context.Context, req *connect.Request[lmsv1.%sRequest]) (*connect.Response[lmsv1.%sResponse], error) {\n",
		r.name, r.summary, recv(s), r.name, r.name, r.name)
	if strings.Contains(call, "m.") || strings.Contains(call, "(m)") {
		b.WriteString("\tm := req.Msg\n")
	}
	res := "lmsv1." + r.name + "Response"
	conv := func(t string) string { return strings.ToLower(t[:1]) + t[1:] + "ToPB" }
	switch {
	case r.resp == "-" || r.resp == "ok" || strings.HasPrefix(r.resp, "ok="):
		fmt.Fprintf(&b, "\tif err := %s; err != nil {\n\t\treturn nil, err\n\t}\n", call)
		switch {
		case r.resp == "-":
			fmt.Fprintf(&b, "\treturn connect.NewResponse(&%s{}), nil\n", res)
		case r.resp == "ok":
			fmt.Fprintf(&b, "\treturn connect.NewResponse(&%s{Ok: true}), nil\n", res)
		default:
			fmt.Fprintf(&b, "\treturn connect.NewResponse(&%s{Ok: true, Message: %s}), nil\n", res, strings.TrimPrefix(r.resp, "ok="))
		}
	default:
		fmt.Fprintf(&b, "\tout, err := %s\n\tif err != nil {\n\t\treturn nil, err\n\t}\n", call)
		switch {
		case r.resp == "okv":
			fmt.Fprintf(&b, "\treturn connect.NewResponse(&%s{Ok: out.OK, Message: out.Message}), nil\n", res)
		case r.resp == "strs":
			fmt.Fprintf(&b, "\treturn connect.NewResponse(&%s{Items: out}), nil\n", res)
		case r.resp == "file":
			fmt.Fprintf(&b, "\treturn connect.NewResponse(&%s{File: &lmsv1.File{Name: out.Name, ContentType: out.ContentType, Data: out.Data}}), nil\n", res)
		case strings.HasPrefix(r.resp, "item:"):
			p := strings.Split(r.resp, ":")
			fmt.Fprintf(&b, "\treturn connect.NewResponse(&%s{%s: %s(out)}), nil\n", res, goCamel(p[1]), conv(p[2]))
		case strings.HasPrefix(r.resp, "items:"):
			t := strings.TrimPrefix(r.resp, "items:")
			fmt.Fprintf(&b, "\tres := &%s{Items: make([]*lmsv1.%s, 0, len(out))}\n\tfor _, x := range out {\n\t\tres.Items = append(res.Items, %s(x))\n\t}\n\treturn connect.NewResponse(res), nil\n", res, t, conv(t))
		case strings.HasPrefix(r.resp, "list:"):
			t := strings.TrimPrefix(r.resp, "list:")
			fmt.Fprintf(&b, "\tres := &%s{Items: make([]*lmsv1.%s, 0, len(out.Items)), Total: int32(out.Total), Page: int32(out.Page), PerPage: int32(out.PerPage)}\n\tfor _, x := range out.Items {\n\t\tres.Items = append(res.Items, %s(x))\n\t}\n\treturn connect.NewResponse(res), nil\n", res, t, conv(t))
		default:
			panic(r.name + ": response " + r.resp + " needs a custom adapter")
		}
	}
	b.WriteString("}\n")
	return b.String()
}

func goCamel(s string) string {
	var b strings.Builder
	up := true
	for _, c := range s {
		if c == '_' {
			up = true
			continue
		}
		if up {
			b.WriteString(strings.ToUpper(string(c)))
			up = false
		} else {
			b.WriteRune(c)
		}
	}
	return b.String()
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
