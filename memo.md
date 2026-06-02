  1. Lock Mode が一番わかりにくい
     仕様上、変更が「保存済みだが未反映」になり、有効設定スナップショットも別に存在します。これはかなり高度です。UI には説明がありますが、
     Some saved changes are not active yet. や View active settings だけだと、なぜ今の設定でブロックされないのか直感的にわかりにくいです。
     参照: docs/spec/domain.md:98, entrypoints/options/OptionsPage.vue:231, components/options/GroupCard.vue:224

  2. Allow only matches は誤設定リスクが高い
     whitelist は「patterns に一致しない URL 全部を制限対象」にする仕様です。UI 表記は短くてよい反面、空 pattern や少ない pattern と組み合
     わせると、ほぼ全サイトが対象になる可能性があります。高度機能として隠すか、選択時に一文だけ強めの説明がほしいです。
     参照: docs/spec/domain.md:24, components/options/PatternListEditor.vue:107

  3. 「Blocked time」と「Daily limit」の違いが UI 上で薄い
     実際には、Blocked time はその時間帯に即ブロック、Daily limit は累積時間でブロックです。グリッドとテキスト入力が同じ表に並んでいるた
     め、初見では「どちらも時間設定」に見えやすいです。
     参照: components/options/LimitRulesEditor.vue:282

  4. 複数グループ一致時の挙動が UI から見えない
     仕様では、1つの URL が複数グループに一致すると全グループに時間加算され、どれか1つでもブロックならブロックされ、ブロック先は表示順で最
     初のグループが採用されます。これはユーザーが予想しづらいです。重複 pattern の警告や、Popup で「このページは複数グループに一致」と出せ
     るとよさそうです。
     参照: docs/spec/domain.md:54, docs/spec/domain.md:65

  5. Daily reset time が“曜日判定”にも効く点が隠れている
     例えば reset が 03:00 なら、月曜 02:00 はまだ日曜ルール扱いです。これは仕様としては正しいですが、UI の Daily reset time だけでは伝わ
     りにくいです。
     参照: docs/spec/domain.md:31, components/options/GlobalSettingsSection.vue:130

  6. Popup が時間帯ブロックの存在を伝えない
     Popup は daily limit のあるグループだけを表示します。そのため、対象グループに時間帯ブロックだけがある場合、No daily limits apply to
     this page. と出て、ユーザーには「制限なし」に見える可能性があります。これは UI から伝わりにくい点として優先度高めです。
     参照: entrypoints/popup/PopupPage.vue:161

  7. 通知設定が少し細かすぎる
     3種類の通知 toggle と threshold があり、特に Blocked redirect notification は redirect のときだけ有効です。シンプルさを重視するなら、
     通知は「残り時間通知」中心にして、他は詳細設定扱いでもよさそうです。
     参照: components/options/GlobalSettingsSection.vue:197