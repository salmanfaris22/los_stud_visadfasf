"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, Skeleton, useConfirm } from "@lms/ui";
import { CertificateService, useRpcMutation, useRpcQuery } from "@lms/api-client";

import { feedback } from "@/lib/feedback";
import { Can } from "@/lib/session";
import { CertificateCanvas } from "./certificate-canvas";
import { sampleValues, type Field } from "./layout";

/** Certificate templates: the design a course's certificates are drawn with. */
export function TemplatesTab() {
  const qc = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const list = useRpcQuery(CertificateService.method.listCertificateTemplates, {});
  const makeDefault = useRpcMutation(CertificateService.method.setDefaultCertificateTemplate, feedback(qc, "Default template changed", [CertificateService]));
  const remove = useRpcMutation(CertificateService.method.deleteCertificateTemplate, feedback(qc, "Template deleted", [CertificateService]));
  const duplicate = useRpcMutation(CertificateService.method.createCertificateTemplate, feedback(qc, "Template copied", [CertificateService], (r) => {
    if (r.template) router.push(`/certificates/templates/${r.template.id}`);
  }));
  const values = sampleValues();

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A template is the certificate design. Each course uses the <b className="text-foreground">default</b> template unless you choose another in the course settings.
          Students get it automatically, with their name, when every task of the course is approved.
        </p>
        <Can module="certificates" action="create"><Button asChild><Link href="/certificates/templates/new"><Plus /> New template</Link></Button></Can>
      </div>
      {list.isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="aspect-[297/240] rounded-2xl" />)}</div>
      ) : list.data?.items.length === 0 ? (
        <EmptyState title="No templates" description="Create a template to design your certificates." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {list.data?.items.map((t) => (
            <Card key={t.id} className="group overflow-hidden p-0">
              <Link href={`/certificates/templates/${t.id}`} className="block bg-muted/40 p-3" aria-label={`Edit ${t.name}`}>
                <div className="overflow-hidden rounded-md shadow-md transition duration-300 group-hover:shadow-xl">
                  <CertificateCanvas background={t.backgroundUrl} fields={t.fields as unknown as Field[]} values={values} />
                </div>
              </Link>
              <div className="flex items-center gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{t.name}</span>
                    {t.isDefault && <Badge>Default</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.isDefault ? "Used by every course without its own template" : t.courseCount === 0 ? "Not chosen by any course yet" : `Chosen by ${t.courseCount} course${t.courseCount === 1 ? "" : "s"}`}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Template actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => router.push(`/certificates/templates/${t.id}`)}><Pencil /> Edit</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => duplicate.mutate({ input: { name: `Copy of ${t.name}`, backgroundUrl: t.backgroundUrl, fields: t.fields } })}><Copy /> Duplicate</DropdownMenuItem>
                    {!t.isDefault && <DropdownMenuItem onSelect={() => makeDefault.mutate({ id: t.id })}><Star /> Make default</DropdownMenuItem>}
                    {!t.isDefault && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={async () => {
                            const msg = t.courseCount > 0 ? `${t.courseCount} course(s) use it; they will switch to the default template.` : "This cannot be undone.";
                            if (await confirm({ title: `Delete "${t.name}"?`, description: msg, destructive: true, confirmText: "Delete" })) remove.mutate({ id: t.id });
                          }}
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
