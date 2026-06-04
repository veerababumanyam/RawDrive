"use client";
import Link from "next/link";
import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";
import { Briefcase, CreditCard } from "@/components/icons";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

export default function CRMDocumentsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <CRMSecondaryNav />
      <Card variant="panel" padding="md" aria-labelledby="documents-title">
        <CardHeader>
          <p className="text-sm font-medium text-accent-primary">Studio CRM</p>
          <h1
            id="documents-title"
            className="mt-1 text-2xl font-semibold text-text-primary"
          >
            Documents
          </h1>
        </CardHeader>
        <CardContent>
          <p className="max-w-3xl text-sm text-text-secondary">
            Contracts and proposals are part of the Studio CRM lifecycle.
            Backend contract APIs already exist; the full dashboard document
            workbench is planned for M27.
          </p>
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <Link
            href="/crm/projects"
            className="glass-button glass-button--surface glass-button--md"
          >
            <span className="glass-button__icon">
              <Briefcase aria-hidden="true" />
            </span>
            <span>Open Projects</span>
          </Link>
          <Link
            href="/billing"
            className="glass-button glass-button--surface glass-button--md"
          >
            <span className="glass-button__icon">
              <CreditCard aria-hidden="true" />
            </span>
            <span>Open Billing</span>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
