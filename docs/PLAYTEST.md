# SIGNAL//BREAK · beta candidate 0.2.13

This packet is prepared for the project owner’s post-roadmap beta. The build stamp appears under the title menu. Record it when reporting a result. [Development web build](https://signalbreak-game.website.yandexcloud.net/) · [Combat refinement and verification](COMBAT_REFINEMENT.md)

## English

Signalbreak is a real-time deckbuilding RPG. Hessa, Corvin and Pin share one hand, one deck and one party health bar. The six standard attacks are Weak, Medium and Strong in suits A and B. Any of the three ranks can start a combo. Follow with higher ranks, then an Arte or a Relay. Tap a Repair Kit and choose a Ready hero to restore shared HP. In a run you choose routes, fight, adjust your deck and discover new options for future runs.

**Access.** Open the development build in a landscape browser. For an offline test, first wait for **Available offline**, then go offline and reopen the same URL. Saves and unlocks belong to the browser and address you use. An active encounter restarts on Continue. Apple Home Screen installation and the native Swift Playgrounds build are separate device tests. The candidate has a small-screen rotation prompt. Native execution, listening quality and physical touch comfort still need device evidence.

**Controls.** Tap a card to queue it, swipe up to store it in Reserve, and swipe down to Churn it. Hold a card or enemy for details. Tap a hero for Relay or an enemy to target them. On keyboard, 1–6 plays, Alt+1–6 stores, Shift+1–6 Churns, Q/W/E selects a hero, T cycles targets, and Space finishes or takes a Cash Out. Backspace takes back a waiting command. Esc pauses. Settings offer Tactical timing, relaxed enemy speed, Reduced Motion, screen shake and separate audio controls. All are available on a new profile.

### What to try

- **New to the game.** Start with a fresh browser profile and play until at least one boss attempt or a point where you choose to stop. Use whichever help or accessibility settings you would naturally choose. Record what you used and when. Afterwards try the Museum and inspect a possible next-run loadout.
- **Returning or experienced.** Continue through Acts II and III and try a different earned relic in a later run. Include one save/resume and, where available, one cached launch offline. Record both wins and defeats. Explore mechanics that interest you, then note which you used voluntarily and which you were trying specifically for the test.
- **Device compatibility.** If you are testing a phone or tablet, note landscape edge and safe-area behavior, rotation, touch at the edges, background/resume and offline reload. If testing the Swift Playgrounds project on an iPad, unzip it, open `SignalBreak.swiftpm` in Playgrounds and use Run. Record any iOS or Playgrounds errors and whether a save survives a full relaunch. [Native project requirements](../README.md)

### Feedback

Report the build stamp, device and OS, browser or installed mode, viewport or screen size if known, language, previous deckbuilder experience, selected relic, settings, Act/encounter and outcome. A screenshot or short recording is optional. Include only what is relevant. Do not include personal or account information.

1. What did you expect combat to be like, and what did you do in your first fight? Which task did the tutorial help with? Where did you seek extra help?
2. Describe a decision that felt clear and one that took longer. Could you read the relevant card or warning and set the target? Which input or timing mattered?
3. At which encounter did difficulty change most for you? What was happening just before it? How did it differ from the preceding fight or boss?
4. Describe one deck or combo you chose to build around. When did you use Reserve or Churn on your own, if at all? What did you gain or give up by doing it? How did you find any EX recipe?
5. After a run, what did you notice in the Museum or starter list? What, if anything, led you to start another run and choose a different strategy?
6. Which enemy or encounter felt distinct? What did you make of the boss’s warnings and follow-ups?
7. Which visual, animation or sound helped or distracted you? What changed with mute or Reduced Motion, if used? Were any sounds hard to distinguish, too loud or hard to hear?
8. Describe any missed input, stutter, load, battery or resume issue and exactly when it occurred. Which parts would you play again and which would you skip?

For a defect, give the shortest sequence you know, expected outcome, actual outcome, frequency and whether a reload affected it. Include cards, queue or target if they matter. Prioritize reproducible loss of saves, inability to continue or launch, then repeated readability and input problems. Keep enjoyment and preferences as evidence about experience. Group recurring problems by platform, language and experience level before drawing a conclusion.

## Русский

Signalbreak — ролевая игра с колодой и боями в реальном времени. У Хессы, Корвина и Пина общие рука, колода и запас здоровья. Обычные атаки бывают слабые, средние и сильные, мастей A и B. Начать цепочку можно с любого из трёх рангов. Повышайте ранг, завершайте цепочку арте или передавайте Эстафету. Чтобы вылечить отряд, коснитесь ремкомплекта и выберите готового героя. В забеге выбирайте маршрут и меняйте колоду, а между забегами изучайте Музей и открытые варианты старта.

**Запуск.** Откройте сборку в браузере горизонтально. Для проверки без сети дождитесь надписи **«Доступно офлайн»**, отключите сеть и заново откройте тот же адрес. Хранилище привязано к браузеру и адресу. «Продолжить» перезапускает текущий незаконченный бой. Установка на экран «Домой» и запуск проекта в Swift Playgrounds проверяются отдельно на устройстве. Качество звука и удобство управления на реальных телефонах и планшетах предстоит проверить.

**Управление.** Нажмите карту, чтобы поставить её в очередь. Смахните вверх для Резерва, вниз для Замены. Удерживайте карту или врага для подробностей. Нажмите героя для Эстафеты, врага — чтобы сменить цель. На клавиатуре `1`–`6` разыгрывают карты, `Alt` с цифрой убирает карту в Резерв, `Shift` с цифрой выполняет Замену, `Q`/`W`/`E` выбирают героя, `T` меняет цель, пробел завершает комбо или выполняет Выплату. `Backspace` отменяет ожидающую команду, `Esc` ставит паузу. В настройках сразу доступны тактический темп, замедление врагов, снижение анимации, тряска и громкость.

### Что попробовать

- Если играете впервые, начните со свежего профиля. Дойдите до первого босса или остановитесь, когда захотите. Пользуйтесь подсказками и настройками как обычно и отметьте, что именно пригодилось. После боя загляните в Музей и меню нового забега.
- Если уже знакомы с игрой, по возможности сыграйте акты II и III, попробуйте другую доступную стартовую реликвию и восстановите забег после перезапуска. Если доступна проверка без сети, снова откройте кэшированную сборку. Отдельно отметьте добровольные тактические решения и действия, которые вы проверяли специально.
- На телефоне или планшете отметьте поворот, доступность кнопок у края, возобновление после сворачивания и запуск без сети. Для нативной проверки на iPad распакуйте архив, откройте `SignalBreak.swiftpm` в Swift Playgrounds и нажмите Run. Запишите сообщения об ошибках и проверьте сохранение после полного перезапуска.

### Что сообщить

Укажите номер и метку сборки, устройство и ОС, браузер или режим приложения, язык, опыт в рогаликах с колодой, реликвию, настройки, акт, противника и исход. Скриншоты и видео по желанию, без личных данных.

1. Что вы попробовали в первом бою? В чём помогло обучение и где понадобилась дополнительная подсказка?
2. Какое решение было понятно сразу, а какое заняло время? Хватило ли времени прочитать карту, предупреждение и выбрать цель?
3. В каком бою сильнее всего изменилась сложность? Что произошло непосредственно перед этим?
4. Какую комбинацию или колоду вы пытались собрать? В каких случаях сами использовали Резерв или Замену? Как нашли EX-комбо, если нашли?
5. Что заметили в Музее и в списке реликвий? Захотелось ли начать ещё один забег и почему?
6. Чем запомнились враги и боссы? Что вы поняли по предупреждениям и следующим действиям?
7. Какие рисунки, движения и звуки помогли или мешали? Что изменилось без звука или с уменьшенной анимацией?
8. Где были задержки, пропуски касаний, долгие загрузки или проблемы после сворачивания? Что хотелось бы повторить, а что пропустить?

Для ошибки запишите действия по порядку, ожидаемый и фактический результат, частоту и эффект перезапуска. В первую очередь важны воспроизводимые ошибки, из-за которых теряется сохранение или нельзя продолжить игру.
