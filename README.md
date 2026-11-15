# DevMenu Web

> 本Repositoryは、ポートフォリオ公開用に作成したProject成果物のCopyです。Security、Environment固有情報、運用記録、作業履歴その他の一部内容は公開対象から除外しています。そのため、内部Repositoryの完全な構成および履歴とは一致しません。

## Overview

DevMenuのBrowser向けSingle Page Applicationです。認証を必要とせず、次の利用者Flowを提供します。

- 入力条件に基づく課題提案の注文と結果表示
- 技術ごとの共有履歴一覧の閲覧
- 共有履歴の詳細閲覧

Backend APIは同一Originの `/api` 配下を使用します。Local Development Serverだけが `DEV_MENU_BACKEND_ORIGIN` へのProxyを提供し、Build ArtifactやRuntime ContainerへBackend Originを埋め込みません。

## Public Snapshot Boundary

この公開版にはApplication実装だけでなく、品質・Delivery設計の成果も含めています。

- React / TypeScript Application、Unit / Component Test
- OpenAPI Contract、生成型および型生成Tool
- PlaywrightによるControlled / Deployed / Real Integration Test Harness
- Sanitized Test Reporter
- Docker / non-root Nginx Runtime
- Kubernetes / KustomizeのEnvironment別構成
- GitLab CI/CD Pipeline、Build / Scan / Push / Deploy / Recovery Script
- Project固有の開発、Security、Accessibility指針

公開版では、実Account、Repository URI、Environment Host、Runner名、Ingress Group名および非公開文書へのLinkをExample値へ置換または抽象化しています。Git履歴、Credential、Secret、運用Evidenceおよび作業履歴は含みません。

## Technology Stack

- Node.js 24 / npm 11
- React 19 / React Router 7
- TypeScript 6
- Vite 8
- Vitest 5 / Testing Library / jsdom
- Playwright 1.64
- ESLint / Prettier
- OpenAPI TypeScript
- Nginx 1.30 based non-root Runtime Container
- Kubernetes / Kustomize
- GitLab CI/CD

正確なVersionとDependencyは [package.json](package.json)、[package-lock.json](package-lock.json)、[tools/openapi/package.json](tools/openapi/package.json) および [Dockerfile](Dockerfile) を参照してください。

## Repository Structure

```text
.
├── src/
│   ├── app/                 # Application entry point and routing
│   ├── features/            # Practice proposal and shared-history features
│   ├── generated/api/       # OpenAPI-generated TypeScript types
│   └── shared/              # Shared API, components, styles and test setup
├── tests/
│   ├── e2e/controlled/      # API interception based controlled integration tests
│   ├── e2e/deployed/        # Deployed frontend and routing tests
│   ├── e2e/real/            # Real frontend/backend/database integration tests
│   └── harness/             # Test harness and sanitized reporter tests
├── openapi/                 # Proposal Service current and baseline contracts
├── tools/openapi/           # OpenAPI type-generation tooling
├── deploy/kustomize/        # Kubernetes base and sanitized environment overlays
├── docker/nginx/            # Runtime Nginx configuration
├── gitlab/                  # CI common definitions, scripts and runner examples
├── .gitlab-ci.yml           # CI/CD job graph
├── AGENTS.md                # Module engineering guidelines
├── Dockerfile               # Reproducible application build and runtime image
├── playwright.config.ts     # Formal integration-test configuration
└── vite.config.ts           # Build, local proxy and unit-test configuration
```

## Build and Execution

### Prerequisites

- Node.js `>=24 <25`
- npm `>=11 <12`

### Install Dependencies

```bash
npm ci
npm --prefix tools/openapi ci
```

### Start the Local Development Server

```bash
cp .env.example .env.local
npm run dev
```

`.env.local` の `DEV_MENU_BACKEND_ORIGIN` には、Credential、Path、QueryまたはFragmentを含まないBackendのHTTP(S) Originを設定します。Vite Development Serverは `/api` だけをそのOriginへProxyします。

### Production Build

```bash
npm run build
```

Build Artifactは `dist/` へ生成されます。Runtime ImageはMulti-stage [Dockerfile](Dockerfile)でBuildし、非root Nginxから静的Artifactを配信します。

### Generate OpenAPI Types

```bash
npm run contract:generate
```

生成元は [openapi/proposal-service.yaml](openapi/proposal-service.yaml)、生成先は [src/generated/api/proposal-service.d.ts](src/generated/api/proposal-service.d.ts) です。生成型を直接編集せず、Contract変更時に再生成して差分を確認します。

## Verification

### Static Validation

```bash
npm run static:check
```

### Unit, Component and Harness Tests

```bash
npm run test
npm run test:coverage
```

Coverage Thresholdは [vite.config.ts](vite.config.ts) を正とします。

### Production Build Validation

```bash
npm run build
```

### Browser Integration Test Discovery

```bash
PUBLIC_BASE_URL=https://staging.example.invalid npm run test:e2e:list
```

このCommandはTest Discoveryの例です。Controlled / Deployed / Real Integration Testの実行には、検証用Environmentと承認されたFixture / Cleanup契約が必要です。公開Snapshotに実Environment値やFixture値は含まれません。

PlaywrightはScreenshot、TraceおよびVideoを保存せず、Custom ReporterがTest ID、分類、件数およびPASS / FAILだけをSanitized JSON / JUnitへ出力します。

## CI/CD Design

[.gitlab-ci.yml](.gitlab-ci.yml) と [gitlab/](gitlab/) は、実際に構築したDelivery Flowを公開用識別子へ抽象化したものです。

- Merge RequestおよびFeature / Fix Branchで、Install、Static Check、Dependency Audit、Unit / Component Test、OpenAPI Contract CheckおよびApplication Buildを実行
- Protected Integration Branchで、OCI Image Build、Trivy / Dockle Scan、ECR Push、Staging Preflight、Deploy、Runtime VerificationおよびIntegration Testを実行
- OCI Imageを一度だけBuildし、同一ArtifactをScanとPushへ引き渡す
- Quality Runner、Image Build RunnerおよびProtected Delivery Runnerの責務を分離
- OIDC、Target Guard、Server-side Dry-run / DiffおよびNamespace境界でDeployをFail-closed化
- Staging検証済みImmutable DigestをProductionへ再BuildなしでPromotion
- Production Preflight、Blocking Manual Deploy、Runtime VerificationおよびOptional Recoveryを独立Checkpoint化
- Manifest、Credential、Response BodyおよびRaw LogをEvidenceへ保持しない

Runner Tag、Registry、HostおよびIngress Groupは公開例用の値です。そのまま実EnvironmentへDeployせず、利用するPlatformの承認済み設定へ置き換えてください。

## Runtime and Deployment Design

[deploy/kustomize/](deploy/kustomize/) は、Frontend所有ResourceとEnvironment別Overlayを示します。

- Deployment、Service、ServiceAccount、IngressをFrontendの所有境界とする
- non-root、read-only root filesystem、Privilege Escalation禁止
- Startup / Readiness / Liveness Probe
- Resource Request / Limit
- Digest固定Image
- Environment別Namespace、HostおよびIngress Group
- Infrastructure所有ResourceをApplication Manifestから変更しない

公開版のRegistry、DomainおよびIngress GroupはExample値であり、実Environmentを表しません。

## Security Notes

- Browser入力だけを最終判定とせず、Backendでの再検証を前提としています。
- API ResponseをRuntimeで検証してから表示します。
- 外部文字列はTextとして描画し、Markupとして解釈しません。
- Error表示へ内部Exception、Request IDまたは接続情報を露出させません。
- Secret、CredentialおよびEnvironment固有値をSourceへ固定しません。
- 公開用置換の境界は本READMEのPublic Snapshot Boundaryを正とします。

## License

この公開SnapshotにはLicenseを付与していません。著作権法上認められる範囲を超える利用、複製または再配布の許諾を意味しません。
