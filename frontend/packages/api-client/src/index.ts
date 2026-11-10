export { createApi, type Api, type App } from "./client";
export { errorMessage, errorCode } from "./errors";
export { uploadFile, type UploadPurpose } from "./upload";
export { useRealtime, type RealtimeEvent } from "./realtime";
export { ApiProvider, useApi, invalidateRpc, type InvalidateTarget } from "./context";
export { createRpc } from "./transport";

// gRPC (Connect): TanStack Query hooks, errors, and every generated service + message.
export { useQuery as useRpcQuery, useMutation as useRpcMutation, useInfiniteQuery as useRpcInfiniteQuery } from "@connectrpc/connect-query";
export * from "./rpc";
