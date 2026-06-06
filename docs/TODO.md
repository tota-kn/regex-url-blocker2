1. Lock Mode が一番わかりにくい
   仕様上、変更が「保存済みだが未反映」になり、有効設定スナップショットも別に存在します。これはかなり高度です。UI には説明がありますが、
   Some saved changes are not active yet. や View active settings だけだと、なぜ今の設定でブロックされないのか直感的にわかりにくいです。
   参照: docs/spec/domain.md:98, entrypoints/options/OptionsPage.vue:231, components/options/GroupCard.vue:224

2. Daily reset time が“曜日判定”にも効く点が隠れている
   例えば reset が 03:00 なら、月曜 02:00 はまだ日曜ルール扱いです。これは仕様としては正しいですが、UI の Daily reset time だけでは伝わ
   りにくいです。
   参照: docs/spec/domain.md:31, components/options/GlobalSettingsSection.vue:130

3. 通知設定が少し細かすぎる
   3種類の通知 toggle と threshold があり、特に Blocked redirect notification は redirect のときだけ有効です。シンプルさを重視するなら、
   通知は「残り時間通知」中心にして、他は詳細設定扱いでもよさそうです。
   参照: components/options/GlobalSettingsSection.vue:197

4. 深呼吸アニメーションをもう少し大きくする。

5. 現在ページをグループへ追加する導線
   v1 非要件では popup からの追加は除外されていますが、拡張機能としてはかなり欲しい機能です。まずは Options 側で「現在開いている URL / hostname を pattern として追加」できる導線を検討するとよさそうです。popup 直接追加は v2 候補として分けます。
   参照: docs/spec/non-goals.md:4, docs/spec/ui.md:39

6. URL pattern のテスト機能
   正規表現や裸ドメインが意図した URL にマッチするかを Options 上で試せると、誤ブロック・ブロック漏れを減らせます。Group card 内で test URL を入力し、どの pattern が一致したか、blacklist / whitelist で最終的に対象になるかを表示します。
   参照: docs/spec/domain.md:73, utils/urlPatterns.ts, utils/blocking.ts

7. 一時停止の履歴・理由表示
   現在は group pause が runtime 状態として存在しますが、ユーザーが「いつまで止まっているか」「待機中か」を Options / Popup でより明確に把握できると使いやすいです。履歴ダッシュボードではなく、現在状態の説明に限定します。
   参照: docs/spec/storage.md:138, components/options/GroupCard.vue

8. ブロックページからの次アクション
   blocked page で理由は表示できるので、次に「設定を開く」「このグループの残り時間を見る」「一時停止をリクエストする」などの行動に進めるとよさそうです。Lock Mode との整合が必要なので、最初は Options への deep link 程度が安全です。
   参照: docs/spec/ui.md:56, entrypoints/blocked/BlockedPage.vue

9. 設定テンプレートの追加・カスタム化
   既存テンプレートは便利ですが、ユーザー自身のよく使う制限セットを保存できるとセットアップが速くなります。まずは組み込みテンプレートの追加候補を TODO に残し、カスタムテンプレートは storage schema 変更が必要な v2 機能として扱います。
   参照: docs/spec/ui.md:12, docs/spec/storage.md
