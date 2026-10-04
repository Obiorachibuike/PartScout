import type { ResearchReport } from "@/types/research";
import { VerdictPanel } from "@/components/research/verdict-panel";
import { ModelGroups } from "@/components/research/model-groups";
import { ChecksPanel } from "@/components/research/checks-panel";
import { ConflictsPanel } from "@/components/research/conflicts-panel";
import { ConfidenceView } from "@/components/research/confidence-view";
import { SourceList } from "@/components/research/source-list";
import { ClaimsExplorer } from "@/components/research/claims-explorer";
import { FeedbackWidget } from "@/components/research/feedback-widget";
import { RecommendedParts } from "@/components/research/recommended-parts";
import { ReportPlan } from "@/components/research/report-plan";
import { VerifyList } from "@/components/research/verify-list";

/**
 * Full report layout. Order is deliberate: verdict → what fits → why → conflicts
 * → verify-before-install → confidence detail → sources → raw claims → feedback.
 */
export function ResearchReportView({ report }: { report: ResearchReport }) {
  const claimsBySource = new Map<string, number>();
  for (const claim of report.claims) {
    claimsBySource.set(claim.sourceId, (claimsBySource.get(claim.sourceId) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <VerdictPanel report={report} />

      {report.compatibleParts.length > 0 ? <RecommendedParts report={report} /> : null}

      <ModelGroups compatible={report.compatibleModels} incompatible={report.incompatibleModels} />

      <ChecksPanel checks={report.checks} variantRisks={report.variantRisks} />

      <VerifyList report={report} />

      <ConflictsPanel conflicts={report.conflicts} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <SourceList sources={report.sources} claimsBySource={claimsBySource} />
        <div className="space-y-6">
          <ConfidenceView confidence={report.confidence} />
          <ReportPlan report={report} />
        </div>
      </div>

      <ClaimsExplorer claims={report.claims} />

      <FeedbackWidget researchId={report.id.startsWith("rs_") ? null : report.id} />
    </div>
  );
}
