package rpc

import (
	"context"
	"time"

	"connectrpc.com/connect"

	lmsv1 "github.com/lms/backend/gen/lms/v1"
)

// heartbeat keeps proxies from closing an idle stream.
const heartbeat = 25 * time.Second

// Subscribe streams the signed-in user's realtime events until the client goes away.
// The first event is "hello"; "ping" events are heartbeats the client ignores.
func (c notificationServer) Subscribe(ctx context.Context, _ *connect.Request[lmsv1.SubscribeRequest], stream *connect.ServerStream[lmsv1.SubscribeResponse]) error {
	p := actor(ctx)
	events, done := c.hub.Subscribe(p.ID)
	defer done()
	send := func(typ string, data any) error {
		return stream.Send(&lmsv1.SubscribeResponse{Type: typ, Data: structToPB(data)})
	}
	if err := send("hello", map[string]string{"user_id": p.ID.String()}); err != nil {
		return err
	}
	tick := time.NewTicker(heartbeat)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case ev := <-events:
			if err := send(ev.Type, ev.Data); err != nil {
				return err
			}
		case <-tick.C:
			if err := send("ping", nil); err != nil {
				return err
			}
		}
	}
}
