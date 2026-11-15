# AGENTS.md

## Pull Request Review Policy

- 必ず日本語でレビューおよびコメントをしてください。

## Architecture and Responsibility

- Feature-orientedな構造を維持し、画面機能、Application全体の組み立て、共通UIおよび技術的な共通処理の責務を混在させない。
- `shared`から`features`へ依存させず、画面機能間の直接参照を避ける。共有が必要な要素だけを、責務を明確にして`shared`へ配置する。
- API通信は共通のClient境界を介し、ComponentへFetch処理、HTTP固有処理およびError解析を分散させない。
- OpenAPIから生成した型を直接編集せず、API固有の型と画面表示用のModelをMapping境界で分離する。
- Browser側の状態を永続Dataの正とせず、Global Stateは複数箇所で共有する必要が明確な最小範囲に限定する。

## Implementation Quality

- 変数および関数はlowerCamelCase、定数はUPPER_SNAKE_CASE、Component、ClassおよびInterfaceはPascalCaseとする。Booleanは`is`、`has`または`should`で始める。
- 文脈上自明でない数値を直接記述せず定数化する。4桁を超える数値Literalには、TypeScriptが対応する数値区切り文字を使用する。
- 配列の反復は要素を直接扱う構文を優先し、Indexが必要な場合だけIndexを使用する。
- 処理を責務と意図が明確な関数へ分割する。引数は最大7個、原則6個以内とし、関数は20行以内を目安、50行以内を推奨、100行以上では分割を検討する。
- TypeScriptの型安全性を維持し、型Assertや`any`によって外部入力、API ResponseまたはStateの不確実性を隠さない。
- 非同期Requestの切替、中断およびComponent破棄を考慮し、古いResponseやErrorで現在のStateを上書きしない。
- Environment依存のHost、Endpoint、Modeその他の設定値をSourceまたはBuild Artifactへ固定せず、実行環境から供給できる境界を保つ。
- 画面間で配色、操作表現、Loading、ErrorおよびFocusの扱いを可能な限り統一する。

## Testing and Verification

- 条件分岐を網羅し、Code全体のCoverageを80%以上、主要Logicを含む関数またはModuleのCoverageを90%以上に保つ。
- TestはGiven–When–Thenを基本とし、準備、Stub、実行、AssertおよびVerifyの区切りを明確にする。
- 内部実装ではなく利用者から観測できる表示、操作、状態遷移およびAccessibility上の結果を優先して検証する。
- 正常系だけでなく、入力境界、API Error、通信失敗、不正Response、Retry、Request競合およびCancellationを検証する。
- API ClientをTest Doubleへ差し替えられる構造を保ち、外部接続なしで画面機能全体を検証可能にする。

## Security

- Browser側の入力検証だけを最終判定とせず、Backendによる再検証を前提とした境界を維持する。
- 利用者入力および外部から取得した文字列は通常のTextとして描画し、`dangerouslySetInnerHTML`その他のMarkup解釈を使用しない。
- API Responseは信頼せず、表示に使用する前に型、必須項目、列挙値、識別子、日時および要素構成を検証する。
- Password、API Key、Credentialその他の機密情報をSource、設定の既定値、Build ArtifactまたはBrowser Logへ含めない。
- Error表示へ内部Exception、Stack Trace、接続先、Request IDその他の内部情報を露出させない。

## Performance

- Stateの所有範囲を必要最小限にし、不要な再Render、重複Requestおよび同一Dataの重複保持を避ける。
- Request中断後の処理を残さず、中断済み処理によるState更新や利用者向けError表示を行わない。
- 大きなData、画面固有Dataまたは一時的な通信状態を、根拠なくGlobal Stateへ保持しない。

## Module-specific Considerations

- Semantic HTMLを使用し、Keyboardだけで全操作を完了できること、Focusが視認できること、状態を色だけで伝えないことを確認する。
- Loading、Error、更新通知および画面遷移後のFocusを支援技術から認識できるよう、適切なARIA属性とProgrammatic Focusを使用する。
- 外部の数値識別子は精度損失を避けるためStringとして扱い、JavaScriptの`Number`へ安易に変換しない。
- HTTP StatusとError Codeの組合せを境界で検証し、既知Errorと未知または不整合なErrorを安全に分離する。
- APIから取得した日時は元の値を保持したまま表示用へ変換し、不正な日時を部分的に表示しない。
- `package-lock.json`、Dependency定義、生成型およびSourceの整合を維持し、生成物やLockfileを手作業で部分修正しない。
