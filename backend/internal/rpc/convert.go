package rpc

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	lmsv1 "github.com/lms/backend/gen/lms/v1"
)

// Helpers used by the generated converters (convert_gen.go) and the adapters.

// uuidToPB writes an id; the zero id becomes "".
func uuidToPB(id uuid.UUID) string {
	if id == uuid.Nil {
		return ""
	}
	return id.String()
}

// uuidFromPB reads an id that protovalidate already checked; empty or invalid gives uuid.Nil.
func uuidFromPB(s string) uuid.UUID {
	id, err := uuid.Parse(s)
	if err != nil {
		return uuid.Nil
	}
	return id
}

// optUUIDFromPB reads an optional id: unset or empty gives nil.
func optUUIDFromPB(s *string) *uuid.UUID {
	if s == nil || *s == "" {
		return nil
	}
	id, err := uuid.Parse(*s)
	if err != nil {
		return nil
	}
	return &id
}

// optUUID reads a plain string id where "" means none.
func optUUID(s string) *uuid.UUID { return optUUIDFromPB(&s) }

// tsToPB writes a time; the zero time becomes unset.
func tsToPB(t time.Time) *timestamppb.Timestamp {
	if t.IsZero() {
		return nil
	}
	return timestamppb.New(t)
}

func tsFromPB(t *timestamppb.Timestamp) time.Time {
	if t == nil {
		return time.Time{}
	}
	return t.AsTime()
}

func optTsFromPB(t *timestamppb.Timestamp) *time.Time {
	if t == nil {
		return nil
	}
	v := t.AsTime()
	return &v
}

// valueToPB converts any JSON-able value (via its JSON form, so typed slices and structs work).
func valueToPB(v any) *structpb.Value {
	b, err := json.Marshal(v)
	if err != nil {
		return structpb.NewNullValue()
	}
	out := &structpb.Value{}
	if err := protojson.Unmarshal(b, out); err != nil {
		return structpb.NewNullValue()
	}
	return out
}

func valueFromPB(v *structpb.Value) any {
	if v == nil {
		return nil
	}
	return v.AsInterface()
}

// structToPB converts a JSON object (map or struct) to a Struct; nil gives nil.
func structToPB(v any) *structpb.Struct {
	b, err := json.Marshal(v)
	if err != nil || string(b) == "null" {
		return nil
	}
	out := &structpb.Struct{}
	if err := protojson.Unmarshal(b, out); err != nil {
		return nil
	}
	return out
}

// structFromPB decodes a Struct into T through JSON.
func structFromPB[T any](s *structpb.Struct) T {
	var out T
	if s == nil {
		return out
	}
	b, err := protojson.Marshal(s)
	if err != nil {
		return out
	}
	_ = json.Unmarshal(b, &out)
	return out
}

func strListMapToPB(m map[string][]string) map[string]*lmsv1.StringList {
	out := make(map[string]*lmsv1.StringList, len(m))
	for k, v := range m {
		out[k] = &lmsv1.StringList{Values: append([]string{}, v...)}
	}
	return out
}

func strListMapFromPB(m map[string]*lmsv1.StringList) map[string][]string {
	out := make(map[string][]string, len(m))
	for k, v := range m {
		out[k] = append([]string{}, v.GetValues()...)
	}
	return out
}

// uuidsFromPB reads a list of ids (already checked by protovalidate).
func uuidsFromPB(ss []string) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(ss))
	for _, s := range ss {
		out = append(out, uuidFromPB(s))
	}
	return out
}
