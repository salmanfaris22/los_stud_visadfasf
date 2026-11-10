"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, ListVideo, Settings2, Trash2, Users, UsersRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { CourseVersionService, useRpcQuery, BatchService, CourseService, StudentService, useRpcMutation } from "@lms/api-client";
import { Avatar, Badge, Button, Card, CardContent, EmptyState, PageHeader, Skeleton, StatusBadge, TBody, TD, TH, THead, TR, Table, Tabs, TabsContent, TabsList, TabsTrigger, useConfirm } from "@lms/ui";

import { feedback } from "@/lib/feedback";
import { Can, useSession } from "@/lib/session";
import { CourseForm, emptyCourse } from "@/features/courses/course-form";
import { Curriculum } from "@/features/courses/curriculum";
import { VersionActions } from "@/features/courses/version-dialog";

const SITE = process.env.NEXT_PUBLIC_STUDENT_URL ?? "http://localhost:3000";

function CourseStudents({ courseId }: { courseId: string }) {
  const router = useRouter();
  const q = useRpcQuery(StudentService.method.listStudents, { courseId: courseId, perPage: 100 });
  const onVersion = useRpcQuery(CourseVersionService.method.listVersionStudents, { courseId });
  const versionOf = new Map(onVersion.data?.students.map((s) => [s.studentId, s.versionNumber]));
  if (!q.data?.items.length) return <EmptyState icon={<Users />} title="No students enrolled" description="Assign this course from a student's page or enroll a whole batch." />;
  return (
    <Card><Table><THead><TR><TH>Student</TH><TH>Code</TH><TH>Version</TH><TH>Status</TH></TR></THead><TBody>
      {q.data.items.map((s) => (
        <TR key={s.id} className="cursor-pointer" onClick={() => router.push(`/students/${s.id}`)}>
          <TD><span className="flex items-center gap-2"><Avatar src={s.avatarUrl} name={s.name} className="size-7" />{s.name}</span></TD><TD className="font-mono text-xs">{s.studentCode}</TD><TD>{versionOf.get(s.id) ? <Badge variant="secondary">v{versionOf.get(s.id)}</Badge> : "—"}</TD><TD><StatusBadge status={s.status} /></TD>
        </TR>
      ))}
    </TBody></Table></Card>
  );
}

function CourseBatches({ courseId }: { courseId: string }) {
  const q = useRpcQuery(BatchService.method.listBatches, { courseId: courseId, perPage: 100 });
  if (!q.data?.items.length) return <EmptyState icon={<UsersRound />} title="No batches" description="Create Online or Offline batches from the Batches page." action={<Button asChild variant="outline"><Link href="/batches">Open batches</Link></Button>} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {q.data.items.map((b) => (
        <Link key={b.id} href={`/batches/${b.id}`} className="rounded-xl border p-4 transition hover:border-foreground/25">
          <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: b.typeColor }} /><span className="font-medium">{b.name}</span><StatusBadge status={b.status} className="ml-auto" /></div>
          <div className="mt-1 text-xs text-muted-foreground">{b.typeName} · {b.studentCount} students{b.startDate && ` · starts ${b.startDate}`}</div>
        </Link>
      ))}
    </div>
  );
}

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const q = useRpcQuery(CourseService.method.getCourse, { id }, { select: (r) => r.course });
  const [draft, setDraft] = React.useState(emptyCourse());
  React.useEffect(() => { if (q.data) setDraft(emptyCourse(q.data)); }, [q.data]);
  const save = useRpcMutation(CourseService.method.updateCourse, feedback(qc, "Course saved", [CourseService]));
  const del = useRpcMutation(CourseService.method.deleteCourse, feedback(qc, "Course deleted", [CourseService], () => router.replace("/courses")));

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data) return <EmptyState title="Course not found" />;
  const c = q.data;

  return (
    <>
      <PageHeader
        back={<Link href="/courses" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-4" /> Courses</Link>}
        title={c.title}
        description={<span className="flex items-center gap-2"><StatusBadge status={c.status} /> {c.videoCount} videos · {c.mentors.map((m) => m.name).join(", ") || "No mentors"}</span>}
        actions={
          <>
            {c.status === "published" && c.isPublic && <Button variant="outline" asChild><a href={`${SITE}/courses/${c.slug}`} target="_blank" rel="noreferrer"><ExternalLink /> View on site</a></Button>}
            <Can module="courses" action="delete"><Button variant="outline" className="text-destructive" onClick={async () => { if (await confirm({ title: `Delete “${c.title}”?`, description: "Videos, tasks, submissions, batches and enrollments of this course are deleted.", destructive: true, confirmText: "Delete course" })) del.mutate({ id }); }}><Trash2 /> Delete</Button></Can>
            <VersionActions courseId={id} />
          </>
        }
      />
      <Tabs defaultValue="curriculum">
        <TabsList>
          <TabsTrigger value="curriculum"><ListVideo /> Curriculum</TabsTrigger>
          <TabsTrigger value="details"><Settings2 /> Details</TabsTrigger>
          <TabsTrigger value="batches"><UsersRound /> Batches</TabsTrigger>
          {can("students") && <TabsTrigger value="students"><Users /> Students</TabsTrigger>}
        </TabsList>
        <TabsContent value="curriculum"><Curriculum courseId={id} /></TabsContent>
        <TabsContent value="details">
          <Card className="max-w-3xl">
            <CardContent className="pt-5">
              <form onSubmit={(e) => { e.preventDefault(); save.mutate({ id, input: draft }); }} className="grid gap-4">
                <CourseForm value={draft} onChange={setDraft} />
                {can("courses", "edit") && <div><Button type="submit" loading={save.isPending}>Save course</Button></div>}
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="batches"><CourseBatches courseId={id} /></TabsContent>
        <TabsContent value="students"><CourseStudents courseId={id} /></TabsContent>
      </Tabs>
    </>
  );
}
