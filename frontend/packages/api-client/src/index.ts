export { createApi, type Api, type App, type Schemas } from "./client";
export { errorMessage, errorStatus } from "./errors";
export { uploadFile, type UploadPurpose } from "./upload";
export { useRealtime, type RealtimeEvent } from "./realtime";
export type { paths, components } from "./schema";
export { ApiProvider, useApi, invalidatePaths, type InvalidateTarget } from "./context";
export { createRpc } from "./transport";

// gRPC (Connect): generated services + messages, and the TanStack Query hooks for them.
export { useQuery as useRpcQuery, useMutation as useRpcMutation } from "@connectrpc/connect-query";
export { ConnectError, Code } from "@connectrpc/connect";
export { AuthService, type Me } from "./gen/lms/v1/auth_pb";
export { CourseVersionService, type CourseVersion, type VersionChanges, type VersionStudent } from "./gen/lms/v1/course_versions_pb";
