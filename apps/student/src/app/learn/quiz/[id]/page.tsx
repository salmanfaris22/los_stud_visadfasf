"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, XCircle } from "lucide-react";
import { errorMessage, type Schemas } from "@lms/api-client";
import { Badge, Button, Card, Checkbox, EmptyState, Progress, Skeleton, cn, toast } from "@lms/ui";
import { $api } from "@/lib/api";

export default function QuizPage() {
  const { id } = useParams<{ id: string }>();
  const [play, setPlay] = React.useState<Schemas["QuizPlay"] | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, string[]>>({});
  const [result, setResult] = React.useState<Schemas["QuizResult"] | null>(null);
  const [left, setLeft] = React.useState<number | null>(null);
  const start = $api.useMutation("post", "/api/v1/me/quizzes/{id}/start", { onSuccess: setPlay, onError: (e) => toast.error(errorMessage(e)) });
  const submit = $api.useMutation("post", "/api/v1/me/quiz-attempts/{id}/submit", { onSuccess: setResult, onError: (e) => toast.error(errorMessage(e)) });
  React.useEffect(() => { start.mutate({ params: { path: { id } } }); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = React.useCallback(() => {
    if (!play || submit.isPending || result) return;
    submit.mutate({ params: { path: { id: play.attempt_id } }, body: { answers: Object.entries(answers).map(([question_id, option_ids]) => ({ question_id, option_ids })) } });
  }, [play, answers, submit, result]);
  React.useEffect(() => {
    if (!play?.deadline || result) return;
    const t = setInterval(() => {
      const s = Math.round((new Date(play.deadline!).getTime() - Date.now()) / 1000);
      setLeft(s);
      if (s <= 0) { clearInterval(t); finish(); }
    }, 1000);
    return () => clearInterval(t);
  }, [play, result, finish]);

  if (start.isError) return <EmptyState title="Can't start this quiz" description={errorMessage(start.error)} action={<Button asChild variant="outline"><Link href="/learn">Back</Link></Button>} />;
  if (!play) return <Skeleton className="h-96" />;
  const choose = (q: Schemas["PlayQuestion"], opt: string) => {
    const cur = answers[q.id] ?? [];
    setAnswers({ ...answers, [q.id]: q.multi ? (cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]) : [opt] });
  };
  const answered = Object.values(answers).filter((a) => a.length).length;
  const review = new Map(result?.review.map((r) => [r.question_id, r]));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/learn" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back</Link>
      <div className="sticky top-14 z-10 -mx-4 mt-3 bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <h1 className="flex-1 font-display text-xl font-bold">{play.title}</h1>
          {left !== null && !result && <span className={cn("inline-flex items-center gap-1 font-mono text-lg font-bold", left < 60 && "text-destructive")}><Clock className="size-4" />{Math.max(0, Math.floor(left / 60))}:{String(Math.max(0, left % 60)).padStart(2, "0")}</span>}
        </div>
        {!result && <div className="mt-2 flex items-center gap-3"><Progress value={(answered / play.questions.length) * 100} className="h-1.5" /><span className="text-xs text-muted-foreground">{answered}/{play.questions.length}</span></div>}
      </div>
      {result && (
        <Card className={cn("mt-4 p-6 text-center", result.passed ? "border-success/50 bg-success/10" : "border-warning/50 bg-warning/10")}>
          <div className="font-display text-5xl font-extrabold">{result.pct}%</div>
          <p className="mt-2">{result.score}/{result.max_score} points · pass mark {result.pass_pct}%</p>
          <Badge variant={result.passed ? "success" : "warning"} className="mt-3 text-sm">{result.passed ? "Passed 🎉" : "Not passed — review and try again"}</Badge>
        </Card>
      )}
      <div className="mt-4 space-y-4">
        {play.questions.map((q, i) => {
          const r = review.get(q.id);
          return (
            <Card key={q.id} className="p-5">
              <div className="flex gap-2"><span className="font-semibold text-muted-foreground">{i + 1}.</span><p className="flex-1 font-medium whitespace-pre-wrap">{q.body}</p>{r && (r.correct ? <CheckCircle2 className="size-5 text-success" /> : <XCircle className="size-5 text-destructive" />)}</div>
              {q.multi && <p className="mt-1 pl-5 text-xs text-muted-foreground">Choose all that apply</p>}
              <div className="mt-3 grid gap-2">
                {q.options.map((o) => {
                  const chosen = (answers[q.id] ?? []).includes(o.id);
                  const correct = r?.correct_option_ids.includes(o.id);
                  return (
                    <label key={o.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition",
                      !r && chosen && "border-foreground bg-signal/15", r && correct && "border-success bg-success/10", r && chosen && !correct && "border-destructive bg-destructive/10", r && "cursor-default")}>
                      {q.multi ? <Checkbox checked={chosen} disabled={!!r} onCheckedChange={() => choose(q, o.id)} /> : (
                        <input type="radio" name={q.id} checked={chosen} disabled={!!r} onChange={() => choose(q, o.id)} className="size-4 accent-[var(--primary)]" />
                      )}
                      {o.body}
                    </label>
                  );
                })}
              </div>
              {r?.explanation && <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{r.explanation}</p>}
            </Card>
          );
        })}
      </div>
      {!result ? <Button size="lg" className="mt-6 w-full" loading={submit.isPending} onClick={finish}>Submit answers</Button> : <Button size="lg" variant="outline" className="mt-6 w-full" asChild><Link href="/learn">Back to learning</Link></Button>}
    </div>
  );
}
