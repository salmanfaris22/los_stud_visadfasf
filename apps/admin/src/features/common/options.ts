"use client";
import { $api } from "@/lib/api";

const long = { staleTime: 60_000 };

export const useCourseOptions = () => $api.useQuery("get", "/api/v1/courses/options", {}, long);
export const useBatchOptions = (courseId?: string) =>
  $api.useQuery("get", "/api/v1/batches/options", { params: { query: courseId ? { course_id: courseId } : {} } }, long);
export const useStaffOptions = () => $api.useQuery("get", "/api/v1/staff/options", {}, long);
export const useBatchTypes = () => $api.useQuery("get", "/api/v1/batch-types", {}, long);
