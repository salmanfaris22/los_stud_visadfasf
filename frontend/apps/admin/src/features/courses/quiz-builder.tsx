"use client";
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@lms/api-client";
import { Button, Card, Checkbox, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Field, Input, Switch, Textarea } from "@lms/ui";
import { $api } from "@/lib/api";
import { feedback } from "@/lib/feedback";

type Q = Schemas["QuizQuestionInput"];
const blankQ = (): Q => ({ body: "", multi: false, points: 1, explanation: "", options: [{ body: "", is_correct: true }, { body: "", is_correct: false }] });

/** Create or edit a multiple-choice quiz attached to a video. */
export function QuizBuilder({ videoId, quizId, open, onOpenChange }: { videoId: string; quizId?: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const existing = $api.useQuery("get", "/api/v1/quizzes/{id}", { params: { path: { id: quizId ?? "" } } }, { enabled: open && !!quizId });
  const [meta, setMeta] = React.useState({ title: "", description: "", pass_pct: 60, time_limit_minutes: 0, max_attempts: 0 });
  const [questions, setQuestions] = React.useState<Q[]>([blankQ()]);

  React.useEffect(() => {
    if (!open) return;
    const d = existing.data;
    if (quizId && !d) return;
    setMeta({ title: d?.title ?? "", description: d?.description ?? "", pass_pct: d?.pass_pct ?? 60, time_limit_minutes: d?.time_limit_minutes ?? 0, max_attempts: d?.max_attempts ?? 0 });
    setQuestions(d ? d.questions.map((q) => ({ body: q.body, multi: q.multi, points: q.points, explanation: q.explanation, options: q.options.map((o) => ({ body: o.body, is_correct: o.is_correct })) })) : [blankQ()]);
  }, [open, quizId, existing.data]);

  const paths = [`/api/v1/videos/${videoId}/quizzes`, "/api/v1/quizzes"];
  const create = $api.useMutation("post", "/api/v1/videos/{id}/quizzes", feedback(qc, "Quiz created", paths, () => onOpenChange(false)));
  const update = $api.useMutation("put", "/api/v1/quizzes/{id}", feedback(qc, "Quiz saved", paths, () => onOpenChange(false)));
  const setQ = (i: number, q: Partial<Q>) => setQuestions(questions.map((x, j) => (j === i ? { ...x, ...q } : x)));
  const setOpt = (qi: number, oi: number, o: Partial<Q["options"][number]>) => {
    const q = questions[qi]!;
    let options = q.options.map((x, j) => (j === oi ? { ...x, ...o } : x));
    if (o.is_correct && !q.multi) options = options.map((x, j) => ({ ...x, is_correct: j === oi }));
    setQ(qi, { options });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{quizId ? "Edit quiz" : "New quiz"}</DialogTitle></DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const body = { ...meta, questions };
            if (quizId) update.mutate({ params: { path: { id: quizId } }, body });
            else create.mutate({ params: { path: { id: videoId } }, body });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Title" className="sm:col-span-4" required><Input required value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
            <Field label="Description" className="sm:col-span-4"><Input value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></Field>
            <Field label="Pass %"><Input type="number" min={0} max={100} value={meta.pass_pct} onChange={(e) => setMeta({ ...meta, pass_pct: Number(e.target.value) })} /></Field>
            <Field label="Time limit (min)" hint="0 = no limit"><Input type="number" min={0} max={600} value={meta.time_limit_minutes} onChange={(e) => setMeta({ ...meta, time_limit_minutes: Number(e.target.value) })} /></Field>
            <Field label="Max attempts" hint="0 = unlimited"><Input type="number" min={0} max={100} value={meta.max_attempts} onChange={(e) => setMeta({ ...meta, max_attempts: Number(e.target.value) })} /></Field>
          </div>
          <div className="grid gap-3">
            {questions.map((q, qi) => (
              <Card key={qi} className="grid gap-3 p-4">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-sm font-semibold text-muted-foreground">Q{qi + 1}</span>
                  <Textarea rows={2} required value={q.body} onChange={(e) => setQ(qi, { body: e.target.value })} placeholder="Question" />
                  <Button type="button" variant="ghost" size="icon" disabled={questions.length === 1} onClick={() => setQuestions(questions.filter((_, j) => j !== qi))} aria-label="Remove question"><Trash2 /></Button>
                </div>
                <div className="grid gap-2 pl-8">
                  {q.options.map((o, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <Checkbox checked={o.is_correct} onCheckedChange={(v) => setOpt(qi, oi, { is_correct: !!v })} aria-label="Correct answer" />
                      <Input required value={o.body} onChange={(e) => setOpt(qi, oi, { body: e.target.value })} placeholder={`Option ${oi + 1}`} className="h-8" />
                      <Button type="button" variant="ghost" size="icon-sm" disabled={q.options.length <= 2} onClick={() => setQ(qi, { options: q.options.filter((_, j) => j !== oi) })} aria-label="Remove option"><Trash2 /></Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-4 pt-1 text-sm">
                    <Button type="button" variant="outline" size="sm" disabled={q.options.length >= 10} onClick={() => setQ(qi, { options: [...q.options, { body: "", is_correct: false }] })}><Plus /> Option</Button>
                    <label className="flex items-center gap-2"><Switch checked={q.multi} onCheckedChange={(v) => setQ(qi, { multi: v })} /> Multiple correct</label>
                    <label className="flex items-center gap-2">Points <Input type="number" min={0} max={100} value={q.points} onChange={(e) => setQ(qi, { points: Number(e.target.value) })} className="h-8 w-16" /></label>
                  </div>
                  <Input value={q.explanation} onChange={(e) => setQ(qi, { explanation: e.target.value })} placeholder="Explanation shown after submitting (optional)" className="h-8" />
                </div>
              </Card>
            ))}
            <Button type="button" variant="outline" onClick={() => setQuestions([...questions, blankQ()])}><Plus /> Add question</Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending || update.isPending}>Save quiz</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
