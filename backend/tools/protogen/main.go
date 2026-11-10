// Command protogen drafts the gRPC message layer from internal/dto (a temporary migration tool).
//
// It reads every struct in internal/dto and writes:
//   - ../proto/lms/v1/types.proto: one message per DTO, with protovalidate rules from the huma tags
//   - internal/rpc/convert_gen.go: xToPB / xFromPB converters between the dto and generated pb types
//
// Run from backend/: go run ./tools/protogen && make -C .. proto
package main

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

// Types handled elsewhere: hand-written protos (auth, course versions), common.proto, generics, filters.
var skipTypes = map[string]bool{
	"List": true, "PageQuery": true, "File": true, "OK": true, "Person": true,
}

// Files whose types already have hand-written protos.
var skipFiles = map[string]bool{"auth.go": true, "course_versions.go": true}

type def struct {
	name   string
	file   string
	st     *ast.StructType
	params []string
	doc    string
}

type field struct {
	goName string
	json   string
	omit   bool
	typ    ast.Expr
	tags   map[string]string
	doc    string
	int32  bool // force int32 on the wire (List paging fields)
}

var defs = map[string]*def{}

func main() {
	fset := token.NewFileSet()
	files, _ := filepath.Glob("internal/dto/*.go")
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		af, err := parser.ParseFile(fset, f, nil, parser.ParseComments)
		must(err)
		for _, d := range af.Decls {
			gd, ok := d.(*ast.GenDecl)
			if !ok || gd.Tok != token.TYPE {
				continue
			}
			for _, s := range gd.Specs {
				ts := s.(*ast.TypeSpec)
				st, ok := ts.Type.(*ast.StructType)
				if !ok {
					continue
				}
				dd := &def{name: ts.Name.Name, file: filepath.Base(f), st: st}
				if ts.TypeParams != nil {
					for _, p := range ts.TypeParams.List {
						for _, n := range p.Names {
							dd.params = append(dd.params, n.Name)
						}
					}
				}
				doc := ts.Doc
				if doc == nil {
					doc = gd.Doc
				}
				if doc != nil {
					dd.doc = strings.TrimSpace(doc.Text())
				}
				defs[dd.name] = dd
			}
		}
	}

	var names []string
	for n, d := range defs {
		if emit(d) {
			names = append(names, n)
		}
	}
	sort.Strings(names)

	writeProto(names)
	writeGo(names)
}

// emit reports whether a DTO gets a generated message.
func emit(d *def) bool {
	if skipTypes[d.name] || skipFiles[d.file] || len(d.params) > 0 || strings.HasSuffix(d.name, "Filter") || !ast.IsExported(d.name) {
		return false
	}
	for _, f := range fields(d, nil) {
		if f.tags["query"] != "" || f.json == "" {
			return false // query inputs and internal structs (no JSON names)
		}
	}
	return true
}

// fields flattens a struct's fields (embedded structs and List[T] included).
func fields(d *def, subst map[string]ast.Expr) []field {
	var out []field
	for _, f := range d.st.Fields.List {
		tags := map[string]string{}
		if f.Tag != nil {
			raw, _ := strconv.Unquote(f.Tag.Value)
			st := reflect.StructTag(raw)
			for _, k := range []string{"json", "query", "minLength", "maxLength", "minimum", "maximum", "enum", "minItems", "maxItems", "format", "pattern", "doc", "readOnly"} {
				if v, ok := st.Lookup(k); ok {
					tags[k] = v
				}
			}
		}
		t := apply(f.Type, subst)
		if len(f.Names) == 0 { // embedded
			name, args := baseName(t)
			ed := defs[name]
			if ed == nil {
				panic("unknown embedded type " + name)
			}
			sub := map[string]ast.Expr{}
			for i, p := range ed.params {
				sub[p] = args[i]
			}
			ef := fields(ed, sub)
			if name == "List" {
				for i := range ef {
					if ef[i].json != "items" {
						ef[i].int32 = true
					}
				}
			}
			out = append(out, ef...)
			continue
		}
		for _, n := range f.Names {
			if !n.IsExported() {
				continue
			}
			js := strings.Split(tags["json"], ",")
			if js[0] == "-" {
				continue
			}
			doc := tags["doc"]
			if doc == "" && f.Doc != nil {
				doc = strings.TrimSpace(f.Doc.Text())
			}
			if doc == "" && f.Comment != nil {
				doc = strings.TrimSpace(f.Comment.Text())
			}
			out = append(out, field{goName: n.Name, json: js[0], omit: len(js) > 1 && strings.Contains(tags["json"], "omitempty"), typ: t, tags: tags, doc: doc})
		}
	}
	return out
}

func apply(e ast.Expr, subst map[string]ast.Expr) ast.Expr {
	if subst == nil {
		return e
	}
	switch t := e.(type) {
	case *ast.Ident:
		if r, ok := subst[t.Name]; ok {
			return r
		}
	case *ast.StarExpr:
		return &ast.StarExpr{X: apply(t.X, subst)}
	case *ast.ArrayType:
		return &ast.ArrayType{Len: t.Len, Elt: apply(t.Elt, subst)}
	case *ast.MapType:
		return &ast.MapType{Key: t.Key, Value: apply(t.Value, subst)}
	}
	return e
}

func baseName(e ast.Expr) (string, []ast.Expr) {
	switch t := e.(type) {
	case *ast.Ident:
		return t.Name, nil
	case *ast.IndexExpr:
		n, _ := baseName(t.X)
		return n, []ast.Expr{t.Index}
	case *ast.IndexListExpr:
		n, _ := baseName(t.X)
		return n, t.Indices
	}
	panic(fmt.Sprintf("unsupported embedded type %T", e))
}

// ── type classification ──

type kind int

const (
	kScalar kind = iota // string bool int32 int int64 float64
	kUUID
	kTime
	kMsg
	kAny // google.protobuf.Value
	kStruct
	kStrMap // map<string,string>
	kInt32Map
	kStrListMap
	kBytes
)

type shape struct {
	k        kind
	scalar   string // Go scalar name for kScalar
	name     string // dto type name for kMsg
	ptr      bool
	repeated bool
}

func classify(e ast.Expr) shape {
	switch t := e.(type) {
	case *ast.Ident:
		switch t.Name {
		case "string", "bool", "int32", "int", "int64", "float64":
			return shape{k: kScalar, scalar: t.Name}
		case "any":
			return shape{k: kAny}
		}
		if defs[t.Name] == nil {
			panic("unknown type " + t.Name)
		}
		return shape{k: kMsg, name: t.Name}
	case *ast.SelectorExpr:
		switch t.X.(*ast.Ident).Name + "." + t.Sel.Name {
		case "uuid.UUID":
			return shape{k: kUUID}
		case "time.Time":
			return shape{k: kTime}
		case "json.RawMessage":
			return shape{k: kAny}
		}
	case *ast.InterfaceType:
		return shape{k: kAny}
	case *ast.StarExpr:
		s := classify(t.X)
		s.ptr = true
		return s
	case *ast.ArrayType:
		if id, ok := t.Elt.(*ast.Ident); ok && id.Name == "byte" {
			return shape{k: kBytes}
		}
		s := classify(t.Elt)
		s.repeated = true
		return s
	case *ast.MapType:
		v := t.Value
		switch vt := v.(type) {
		case *ast.Ident:
			switch vt.Name {
			case "string":
				return shape{k: kStrMap}
			case "int32":
				return shape{k: kInt32Map}
			case "any":
				return shape{k: kStruct}
			}
		case *ast.ArrayType:
			if id, ok := vt.Elt.(*ast.Ident); ok && id.Name == "string" {
				return shape{k: kStrListMap}
			}
		case *ast.MapType, *ast.InterfaceType:
			return shape{k: kStruct}
		}
	}
	panic(fmt.Sprintf("unsupported field type %#v", e))
}

// wireInt reports the proto integer type for a Go int scalar.
func wireInt(f field, scalar string) string {
	switch scalar {
	case "int32", "int":
		return "int32"
	case "int64":
		if f.int32 || !strings.HasSuffix(f.json, "_paise") {
			return "int32"
		}
		return "int64"
	}
	return scalar
}

func protoScalar(f field, s shape) string {
	switch s.scalar {
	case "float64":
		return "double"
	case "string", "bool":
		return s.scalar
	}
	return wireInt(f, s.scalar)
}

// ── proto ──

func writeProto(names []string) {
	var b bytes.Buffer
	b.WriteString(`// Code generated by backend/tools/protogen from internal/dto. DO NOT EDIT.
// The entity and input messages shared by the lms.v1 services.
syntax = "proto3";

package lms.v1;

import "buf/validate/validate.proto";
import "google/protobuf/struct.proto";
import "google/protobuf/timestamp.proto";
import "lms/v1/common.proto";

// StringList wraps a list of strings so it can be a map value.
message StringList {
  repeated string values = 1;
}
`)
	for _, n := range names {
		d := defs[n]
		b.WriteString("\n")
		if d.doc != "" {
			for _, l := range strings.Split(d.doc, "\n") {
				b.WriteString("// " + strings.TrimSpace(l) + "\n")
			}
		}
		fmt.Fprintf(&b, "message %s {\n", protoName(n))
		for i, f := range fields(d, nil) {
			s := classify(f.typ)
			if f.doc != "" {
				for _, l := range strings.Split(f.doc, "\n") {
					fmt.Fprintf(&b, "  // %s\n", strings.TrimSpace(l))
				}
			}
			var typ string
			switch s.k {
			case kScalar:
				typ = protoScalar(f, s)
			case kUUID:
				typ = "string"
			case kTime:
				typ = "google.protobuf.Timestamp"
			case kMsg:
				typ = protoName(s.name)
			case kAny:
				typ = "google.protobuf.Struct" // free-form JSON objects (plain JsonObject in TS)
			case kStruct:
				typ = "google.protobuf.Struct"
			case kStrMap:
				typ = "map<string, string>"
			case kInt32Map:
				typ = "map<string, int32>"
			case kStrListMap:
				typ = "map<string, StringList>"
			case kBytes:
				typ = "bytes"
			}
			label := ""
			if s.repeated {
				label = "repeated "
			} else if s.ptr && (s.k == kScalar || s.k == kUUID) {
				label = "optional "
			}
			rules := rulesFor(f, s)
			fmt.Fprintf(&b, "  %s%s %s = %d%s;\n", label, typ, f.json, i+1, rules)
		}
		b.WriteString("}\n")
	}
	must(os.WriteFile("../proto/lms/v1/types.proto", b.Bytes(), 0o644))
}

// rulesFor turns huma validation tags into protovalidate rules.
func rulesFor(f field, s shape) string {
	t := f.tags
	var r []string
	switch {
	case s.repeated:
		var items []string
		if v := t["minItems"]; v != "" {
			r = append(r, "min_items: "+v)
		}
		if v := t["maxItems"]; v != "" {
			r = append(r, "max_items: "+v)
		}
		switch {
		case s.k == kUUID:
			items = append(items, "string: {uuid: true}")
		case s.k == kScalar && s.scalar == "string":
			if sr := stringRules(t); sr != "" {
				items = append(items, "string: {"+sr+"}")
			}
		}
		if len(items) > 0 {
			r = append(r, "items: {"+strings.Join(items, ", ")+"}")
		}
		if len(r) == 0 {
			return ""
		}
		return " [(buf.validate.field).repeated = {" + strings.Join(r, ", ") + "}]"
	case s.k == kUUID && s.ptr:
		// Optional ids track presence; "" (an empty picker) means none.
		return ` [(buf.validate.field).string.pattern = "^(|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"]`
	case s.k == kUUID:
		rule := " [(buf.validate.field).string.uuid = true"
		if f.omit {
			rule += ", (buf.validate.field).ignore = IGNORE_IF_ZERO_VALUE"
		}
		return rule + "]"
	case s.k == kScalar && s.scalar == "string":
		sr := stringRules(t)
		if sr == "" {
			return ""
		}
		rule := " [(buf.validate.field).string = {" + sr + "}"
		if f.omit && !s.ptr {
			rule += ", (buf.validate.field).ignore = IGNORE_IF_ZERO_VALUE"
		}
		return rule + "]"
	case s.k == kScalar && s.scalar != "bool":
		typ := protoScalar(f, s)
		if v := t["minimum"]; v != "" {
			r = append(r, "gte: "+v)
		}
		if v := t["maximum"]; v != "" {
			r = append(r, "lte: "+v)
		}
		if len(r) == 0 {
			return ""
		}
		return fmt.Sprintf(" [(buf.validate.field).%s = {%s}]", typ, strings.Join(r, ", "))
	}
	return ""
}

func stringRules(t map[string]string) string {
	var r []string
	if v := t["minLength"]; v != "" {
		r = append(r, "min_len: "+v)
	}
	if v := t["maxLength"]; v != "" {
		r = append(r, "max_len: "+v)
	}
	if v := t["pattern"]; v != "" {
		r = append(r, "pattern: "+strconv.Quote(v))
	}
	switch t["format"] {
	case "email":
		r = append(r, "email: true")
	case "date":
		r = append(r, `pattern: "^\\d{4}-\\d{2}-\\d{2}$"`)
	}
	if v := t["enum"]; v != "" {
		var vals []string
		for _, e := range strings.Split(v, ",") {
			vals = append(vals, strconv.Quote(e))
		}
		r = append(r, "in: ["+strings.Join(vals, ", ")+"]")
	}
	return strings.Join(r, ", ")
}

// ── Go converters ──

func writeGo(names []string) {
	var b bytes.Buffer
	b.WriteString(`// Code generated by backend/tools/protogen from internal/dto. DO NOT EDIT.

package rpc

import (
	"time"

	"github.com/google/uuid"

	lmsv1 "github.com/lms/backend/gen/lms/v1"
	"github.com/lms/backend/internal/dto"
)

var (
	_ = dto.OK{}
	_ = uuid.Nil
	_ = time.Time{}
)
`)
	all := append([]string{"Person"}, names...)
	for _, n := range all {
		d := defs[n]
		pn := protoName(n)
		fn := lowerFirst(pn)
		fs := fields(d, nil)

		fmt.Fprintf(&b, "\nfunc %sToPB(v dto.%s) *lmsv1.%s {\n\tm := &lmsv1.%s{}\n", fn, n, pn, pn)
		for _, f := range fs {
			b.WriteString("\t" + toPB(f) + "\n")
		}
		b.WriteString("\treturn m\n}\n")

		fmt.Fprintf(&b, "\nfunc %sFromPB(m *lmsv1.%s) dto.%s {\n\tvar v dto.%s\n\tif m == nil {\n\t\treturn v\n\t}\n", fn, pn, n, n)
		for _, f := range fs {
			b.WriteString("\t" + fromPB(f) + "\n")
		}
		b.WriteString("\treturn v\n}\n")
	}
	out, err := format.Source(b.Bytes())
	if err != nil {
		os.WriteFile("internal/rpc/convert_gen.go", b.Bytes(), 0o644)
		panic(err)
	}
	must(os.WriteFile("internal/rpc/convert_gen.go", out, 0o644))
}

func toPB(f field) string {
	s := classify(f.typ)
	dst := "m." + goCamelCase(f.json)
	src := "v." + f.goName
	conv := func(x string) string { // one element
		switch s.k {
		case kScalar:
			w := wireInt(f, s.scalar)
			if s.scalar == "int" || (s.scalar == "int64" && w == "int32") {
				return "int32(" + x + ")"
			}
			return x
		case kUUID:
			return "uuidToPB(" + x + ")"
		case kTime:
			return "tsToPB(" + x + ")"
		case kMsg:
			return lowerFirst(protoName(s.name)) + "ToPB(" + x + ")"
		case kAny:
			return "structToPB(" + x + ")"
		case kStruct:
			return "structToPB(" + x + ")"
		case kStrListMap:
			return "strListMapToPB(" + x + ")"
		}
		return x // maps of scalars, bytes
	}
	switch {
	case s.repeated:
		if s.k == kScalar && conv("x") == "x" {
			return fmt.Sprintf("%s = append(%s, %s...)", dst, dst, src)
		}
		return fmt.Sprintf("for _, x := range %s {\n\t\t%s = append(%s, %s)\n\t}", src, dst, dst, conv("x"))
	case s.ptr:
		switch s.k {
		case kScalar:
			w := wireInt(f, s.scalar)
			if s.scalar == "int" || (s.scalar == "int64" && w == "int32") {
				return fmt.Sprintf("if %s != nil {\n\t\tx := int32(*%s)\n\t\t%s = &x\n\t}", src, src, dst)
			}
			return fmt.Sprintf("%s = %s", dst, src)
		case kUUID:
			return fmt.Sprintf("if %s != nil {\n\t\tx := %s.String()\n\t\t%s = &x\n\t}", src, src, dst)
		case kTime:
			return fmt.Sprintf("if %s != nil {\n\t\t%s = tsToPB(*%s)\n\t}", src, dst, src)
		case kMsg:
			return fmt.Sprintf("if %s != nil {\n\t\t%s = %s\n\t}", src, dst, conv("*"+src))
		}
	}
	return fmt.Sprintf("%s = %s", dst, conv(src))
}

func fromPB(f field) string {
	s := classify(f.typ)
	get := "m.Get" + goCamelCase(f.json) + "()"
	dst := "v." + f.goName
	conv := func(x string) string {
		switch s.k {
		case kScalar:
			w := wireInt(f, s.scalar)
			switch {
			case s.scalar == "int":
				return "int(" + x + ")"
			case s.scalar == "int64" && w == "int32":
				return "int64(" + x + ")"
			}
			return x
		case kUUID:
			return "uuidFromPB(" + x + ")"
		case kTime:
			return "tsFromPB(" + x + ")"
		case kMsg:
			return lowerFirst(protoName(s.name)) + "FromPB(" + x + ")"
		case kAny:
			return "structFromPB[any](" + x + ")"
		case kStruct:
			return "structFromPB[" + exprString(f.typ) + "](" + x + ")"
		case kStrListMap:
			return "strListMapFromPB(" + x + ")"
		}
		return x
	}
	switch {
	case s.repeated:
		elt := exprString(f.typ.(*ast.ArrayType).Elt)
		return fmt.Sprintf("for _, x := range %s {\n\t\t%s = append(%s, %s)\n\t}\n\tif %s == nil {\n\t\t%s = []%s{}\n\t}", get, dst, dst, conv("x"), dst, dst, elt)
	case s.ptr:
		raw := "m." + goCamelCase(f.json)
		switch s.k {
		case kScalar:
			w := wireInt(f, s.scalar)
			if s.scalar == "int" || (s.scalar == "int64" && w == "int32") {
				return fmt.Sprintf("if %s != nil {\n\t\tx := %s(*%s)\n\t\t%s = &x\n\t}", raw, s.scalar, raw, dst)
			}
			return fmt.Sprintf("%s = %s", dst, raw)
		case kUUID:
			return fmt.Sprintf("%s = optUUIDFromPB(%s)", dst, raw)
		case kTime:
			return fmt.Sprintf("if %s != nil {\n\t\tx := %s.AsTime()\n\t\t%s = &x\n\t}", raw, raw, dst)
		case kMsg:
			return fmt.Sprintf("if %s != nil {\n\t\tx := %s\n\t\t%s = &x\n\t}", raw, conv(raw), dst)
		}
	}
	return fmt.Sprintf("%s = %s", dst, conv(get))
}

func exprString(e ast.Expr) string {
	var b bytes.Buffer
	must(format.Node(&b, token.NewFileSet(), e))
	s := b.String()
	// Local dto types need the package prefix.
	if id, ok := e.(*ast.Ident); ok && defs[id.Name] != nil {
		return "dto." + s
	}
	if m, ok := e.(*ast.MapType); ok {
		return "map[" + exprString(m.Key) + "]" + exprString(m.Value)
	}
	return s
}

// ── names ──

// protoName turns a Go type name into PascalCase that buf lint accepts (GSTMonth → GstMonth).
func protoName(goName string) string {
	var words []string
	rs := []rune(goName)
	start := 0
	for i := 1; i <= len(rs); i++ {
		if i == len(rs) {
			words = append(words, string(rs[start:]))
			break
		}
		prev, cur := rs[i-1], rs[i]
		next := rune(0)
		if i+1 < len(rs) {
			next = rs[i+1]
		}
		split := (unicode.IsLower(prev) && unicode.IsUpper(cur)) ||
			(unicode.IsUpper(prev) && unicode.IsUpper(cur) && next != 0 && unicode.IsLower(next) && !(cur == 'D' && next == 's' && prev == 'I'))
		if split {
			words = append(words, string(rs[start:i]))
			start = i
		}
	}
	var b strings.Builder
	for _, w := range words {
		b.WriteString(strings.ToUpper(w[:1]) + strings.ToLower(w[1:]))
	}
	return b.String()
}

func lowerFirst(s string) string { return strings.ToLower(s[:1]) + s[1:] }

// goCamelCase is protoc-gen-go's field name rule (google.golang.org/protobuf/compiler/protogen).
func goCamelCase(s string) string {
	var b []byte
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '.' && i+1 < len(s) && isLower(s[i+1]):
		case c == '.':
			b = append(b, '_')
		case c == '_' && (i == 0 || s[i-1] == '.'):
			b = append(b, 'X')
		case c == '_' && i+1 < len(s) && isLower(s[i+1]):
		case c >= '0' && c <= '9':
			b = append(b, c)
		default:
			if isLower(c) {
				c -= 'a' - 'A'
			}
			b = append(b, c)
			for ; i+1 < len(s) && isLower(s[i+1]); i++ {
				b = append(b, s[i+1])
			}
		}
	}
	return string(b)
}

func isLower(c byte) bool { return c >= 'a' && c <= 'z' }

func must(err error) {
	if err != nil {
		panic(err)
	}
}
