"use client";
import * as React from "react";
import { Layers, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { CourseVersionService, errorMessage, useRpcMutation, useRpcQuery, type CourseVersion, type VersionChanges } from "@lms/api-client";
import { Badge, Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, SearchInput, Select, Skeleton, TBody, TD, TH, THead, TR, Table, cn, toast } from "@lms/ui";
import { invalidate } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { useSession } from "@/lib/session";

type Step = "build" | "move";
type Summary = { versions: CourseVersion[]; hasChanges: boolean; changes?: VersionChanges };

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const totalStudents = (versions: CourseVersion[]) => versions.reduce((n, v) => n + v.studentCount, 0);

function builtOn(v: CourseVersion) {
  if (!v.createdAt) return "";
  return new Date(Number(v.createdAt.seconds) * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** "+2 videos", "−1 quiz", "Order changed": what a build would add to the latest version. */
function changeList(c?: VersionChanges) {
  if (!c) return [];
  const row = (added: number, removed: number, one: string, many?: string) => [added > 0 && `+${count(added, one, many)}`, removed > 0 && `−${count(removed, one, many)}`];
  return [...row(c.addedVideos, c.removedVideos, "video"), ...row(c.addedTasks, c.removedTasks, "task"), ...row(c.addedQuizzes, c.removedQuizzes, "quiz", "quizzes"), c.reordered && "Order changed"].filter((x): x is string => !!x);
}

export function useVersionSummary(courseId: string) {
  return useRpcQuery(CourseVersionService.method.getVersionSummary, { courseId });
}

function VersionList({ versions }: { versions: CourseVersion[] }) {
  return (
    <ul className="max-h-44 divide-y overflow-y-auto rounded-xl border">
      {versions.map((v, i) => (
        <li key={v.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <Badge variant={i === 0 ? "signal" : "secondary"}>v{v.number}</Badge>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{v.note || "No note"}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {[builtOn(v), v.createdByName, count(v.videoCount, "video"), count(v.taskCount, "task"), count(v.quizCount, "quiz", "quizzes")].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium tabular-nums">{count(v.studentCount, "student")}</span>
        </li>
      ))}
    </ul>
  );
}

function BuildStep({ courseId, summary, canMove, onMove, onClose }: { courseId: string; summary: Summary; canMove: boolean; onMove: () => void; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = React.useState("");
  const { versions, hasChanges } = summary;
  const latest = versions[0];
  const next = (latest?.number ?? 0) + 1;
  const changes = changeList(summary.changes);
  const build = useRpcMutation(CourseVersionService.method.buildVersion, {
    onSuccess: async (r) => {
      // Wait for the new version to be listed: the move step defaults to it.
      await invalidate(qc, CourseVersionService);
      toast.success(`v${r.version?.number} built. New students get it from now on`);
      if (canMove && totalStudents(versions) > 0) onMove();
      else onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); build.mutate({ courseId, note: note.trim() }); }}>
      <DialogHeader>
        <DialogTitle>Build update</DialogTitle>
        <DialogDescription>
          {hasChanges
            ? `Saves the curriculum as v${next}. New students get v${next}. Current students stay on their version until you move them.`
            : latest ? `Nothing has changed since v${latest.number}. Add, remove or reorder items in the curriculum, then build again.` : "Add a video to the curriculum first."}
        </DialogDescription>
      </DialogHeader>
      {hasChanges && (
        <>
          <div className="rounded-xl border bg-muted/40 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{latest ? `What's new since v${latest.number}` : "First version"}</p>
            <div className="flex flex-wrap gap-1.5">{changes.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}</div>
          </div>
          <Field label="Note" hint="Optional. Helps you tell versions apart.">
            <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Added the deployment lessons" />
          </Field>
        </>
      )}
      {versions.length > 0 && <VersionList versions={versions} />}
      <p className="text-xs text-muted-foreground">Text and link edits to existing items reach every version straight away, so they don't need a build.</p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{hasChanges ? "Cancel" : "Close"}</Button>
        {hasChanges ? <Button type="submit" loading={build.isPending}>Build v{next}</Button> : canMove && totalStudents(versions) > 0 && <Button type="button" onClick={onMove}><Users /> Update students</Button>}
      </DialogFooter>
    </form>
  );
}

function MoveStep({ courseId, summary, canBuild, onBuild, onClose }: { courseId: string; summary: Summary; canBuild: boolean; onBuild: () => void; onClose: () => void }) {
  const qc = useQueryClient();
  const { versions } = summary;
  const [targetId, setTargetId] = React.useState(versions[0]?.id ?? "");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const q = useRpcQuery(CourseVersionService.method.listVersionStudents, { courseId });
  const students = React.useMemo(() => q.data?.students ?? [], [q.data]);
  const target = versions.find((v) => v.id === targetId) ?? versions[0];
  const targetNumber = target?.number ?? 0;

  // Students already on the target can't be picked; this also keeps the count right when the target changes.
  const movable = students.filter((s) => s.versionId !== target?.id);
  const chosen = movable.filter((s) => picked.has(s.enrollmentId));
  const older = movable.filter((s) => s.versionNumber < targetNumber);
  const goingBack = chosen.filter((s) => s.versionNumber > targetNumber).length;
  const needle = search.trim().toLowerCase();
  const shown = needle ? students.filter((s) => [s.name, s.email, s.studentCode, s.batchName].some((t) => t.toLowerCase().includes(needle))) : students;
  const shownMovable = shown.filter((s) => s.versionId !== target?.id);
  const allShown = shownMovable.length > 0 && shownMovable.every((s) => picked.has(s.enrollmentId));
  const batches = [...new Map(students.filter((s) => s.batchId).map((s) => [s.batchId, s.batchName])).entries()];

  const change = (ids: string[], on: boolean) =>
    setPicked((cur) => {
      const nextPicked = new Set(cur);
      ids.forEach((id) => (on ? nextPicked.add(id) : nextPicked.delete(id)));
      return nextPicked;
    });
  const move = useRpcMutation(CourseVersionService.method.moveStudents, feedback(qc, null, [CourseVersionService, "/api/v1/students"], (r) => {
    toast.success(`${count(r.moved, "student")} moved to v${targetNumber}`);
    onClose();
  }));

  return (
    <div className="grid min-w-0 gap-4">
      <DialogHeader>
        <DialogTitle>Update students</DialogTitle>
        <DialogDescription>Moved students keep their work. Anything new in that version shows as to do.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap gap-1.5">
        {versions.map((v, i) => <Badge key={v.id} variant={i === 0 ? "signal" : "secondary"}>v{v.number} · {count(v.studentCount, "student")}</Badge>)}
      </div>
      {summary.hasChanges && canBuild && (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          The curriculum has changes that aren't built yet. <button type="button" className="font-semibold underline" onClick={onBuild}>Build them first</button>
        </p>
      )}
      {q.isLoading ? <Skeleton className="h-52" /> : students.length === 0 ? (
        <p className="rounded-xl border p-5 text-center text-sm text-muted-foreground">No students enrolled yet. New students join on the latest version.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <SearchInput value={search} onChange={setSearch} placeholder="Search students…" />
            <Select aria-label="Move to version" value={target?.id ?? ""} onChange={(e) => setTargetId(e.target.value)}>
              {versions.map((v, i) => <option key={v.id} value={v.id}>Move to v{v.number}{i === 0 ? " (latest)" : ""}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={older.length === 0} onClick={() => change(older.map((s) => s.enrollmentId), true)}>Everyone on older versions ({older.length})</Button>
            {batches.length > 0 && (
              <Select aria-label="Add a batch" className="h-8 w-auto text-xs" value="" onChange={(e) => change(movable.filter((s) => s.batchId === e.target.value).map((s) => s.enrollmentId), true)}>
                <option value="">Add a batch…</option>
                {batches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </Select>
            )}
            {picked.size > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>}
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border">
            <Table>
              <THead>
                <TR>
                  <TH className="w-10"><Checkbox aria-label="Select all shown" checked={allShown} disabled={shownMovable.length === 0} onCheckedChange={(on) => change(shownMovable.map((s) => s.enrollmentId), on === true)} /></TH>
                  <TH>Student</TH><TH>Batch</TH><TH>Version</TH><TH className="text-right">Progress</TH>
                </TR>
              </THead>
              <TBody>
                {shown.map((s) => {
                  const onTarget = s.versionId === target?.id;
                  return (
                    <TR key={s.enrollmentId} className={cn(onTarget ? "opacity-60" : "cursor-pointer")} onClick={() => !onTarget && change([s.enrollmentId], !picked.has(s.enrollmentId))}>
                      <TD onClick={(e) => e.stopPropagation()}><Checkbox aria-label={`Select ${s.name}`} disabled={onTarget} checked={!onTarget && picked.has(s.enrollmentId)} onCheckedChange={(on) => change([s.enrollmentId], on === true)} /></TD>
                      <TD><span className="block font-medium">{s.name}</span><span className="block text-xs text-muted-foreground">{s.email}</span></TD>
                      <TD className="text-muted-foreground">{s.batchName || "—"}</TD>
                      <TD><Badge variant="secondary">{s.versionNumber ? `v${s.versionNumber}` : "—"}</Badge></TD>
                      <TD className="text-right tabular-nums">{s.progressPct}%</TD>
                    </TR>
                  );
                })}
                {shown.length === 0 && <TR><TD colSpan={5} className="py-6 text-center text-muted-foreground">No students match</TD></TR>}
              </TBody>
            </Table>
          </div>
          {goingBack > 0 && <p className="text-sm text-warning">{count(goingBack, "student")} will go back to an older version and lose access to anything added after v{targetNumber}.</p>}
        </>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        {students.length > 0 && target && (
          <Button disabled={chosen.length === 0} loading={move.isPending} onClick={() => move.mutate({ courseId, versionId: target.id, enrollmentIds: chosen.map((s) => s.enrollmentId) })}>
            Move {count(chosen.length, "student")} to v{target.number}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

/** Course page header buttons: "Build update" (dot = unbuilt changes), "Update students" (when some are behind), and their popup. */
export function VersionActions({ courseId }: { courseId: string }) {
  const { can } = useSession();
  const summary = useVersionSummary(courseId);
  const [step, setStep] = React.useState<Step | null>(null);
  const s = summary.data;
  if (!s) return null;
  const canBuild = can("courses", "edit");
  const canMove = can("students", "view") && can("students", "edit");
  const behind = totalStudents(s.versions.slice(1));
  const close = () => setStep(null);
  return (
    <>
      {canMove && behind > 0 && <Button variant="outline" onClick={() => setStep("move")}><Users /> Update students <Badge variant="secondary">{behind}</Badge></Button>}
      {canBuild && (
        <Button variant={s.hasChanges ? "default" : "outline"} onClick={() => setStep("build")}>
          <Layers /> Build update
          {s.hasChanges && <><span aria-hidden className="size-2 rounded-full bg-current" /><span className="sr-only">Unbuilt changes</span></>}
        </Button>
      )}
      <Dialog open={!!step} onOpenChange={(o) => !o && close()}>
        <DialogContent size="lg">
          {step === "move"
            ? <MoveStep courseId={courseId} summary={s} canBuild={canBuild} onBuild={() => setStep("build")} onClose={close} />
            : <BuildStep courseId={courseId} summary={s} canMove={canMove} onMove={() => setStep("move")} onClose={close} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
