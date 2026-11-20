"use client";

import { BatchService, CertificateService, CourseService, StaffService, useRpcQuery } from "@lms/api-client";

const long = { staleTime: 60_000 };

export const useCourseOptions = () => useRpcQuery(CourseService.method.listCourseOptions, {}, { ...long, select: (r) => r.items });
export const useBatchOptions = (courseId?: string) =>
  useRpcQuery(BatchService.method.listBatchOptions, { ...courseId ? { courseId: courseId } : {} }, { ...long, select: (r) => r.items });
export const useStaffOptions = () => useRpcQuery(StaffService.method.listStaffOptions, {}, { ...long, select: (r) => r.items });
export const useCertificateTemplateOptions = () =>
  useRpcQuery(CertificateService.method.listCertificateTemplateOptions, {}, { ...long, select: (r) => r.items });
export const useBatchTypes = () => useRpcQuery(BatchService.method.listBatchTypes, {}, { ...long, select: (r) => r.items });
