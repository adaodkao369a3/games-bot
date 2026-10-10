/**
 * Centralized emoji registry for Bombo Games bot
 * Contains ONLY custom emojis from the bot's Discord application
 * NO default Unicode emojis allowed (except 🕴️ as requested)
 */

export const EMOJIS = {
  // Bot Identity
  bob: '<:bob:1545141387656302663>',

  // Currency
  bombocoin: '<:bombocoin:1545139736312815840>',
  moneybag: '<:moneybag:1545149026528268308>',
  cash: '<:cash:1545149005544165416>',
  bank: '<:bank:1545157599912009868>',

  // Gaming
  controller: '<:controller:1545149011894210642>',
  hammer: '<a:hammer:1545148999386931272>',
  win: '<a:win:1545165325614583888>',
  slots: '<a:slots:1545149049328640120>',
  dice: '<:dice:1545149015652307104>',
  cards: '<:cards:1545829055071395860>',
  // Static emoji for buttons (animated doesn't work in buttons)
  slot_static: '<:slotsbanana:1545161905574903868>',

  // Slot Machine Symbols
  slotsbanana: '<:slotsbanana:1545161905574903868>',
  slotsbar: '<:slotsbar:1545161910348029963>',
  slotscherry: '<:slotscherry:1545161913045098537>',
  slotsseven: '<:slotsseven:1545161915649753119>',
  slotsstrawberry: '<:slotsstrawberry:1545161917834993804>',
  lotteryslots: '<:lotteryslots:1545161895261241454>',

  // Medals & Rankings
  firstplacetrophy: '<a:firstplacetrophy:1545135079926267964>',
  secondplacetrophy: '<a:secondplacetrophy:1545135074968608851>',
  thirdplacetrophy: '<a:thirdplacetrophy:1545135071068033024>',
  trophy: '<:trophy:1545135066148118628>',
  dcrown: '<:dcrown:1545829050847862784>',
  fullstar: '<:fullstar:1553909316581593228>',
  emptystar: '<:emptystar:1553909314463473704>',

  // Numbers
  zero: '<:zero:1545379101496311808>',
  one: '<:one:1545379088775258112>',
  two: '<:two:1545379099394969660>',
  three: '<:three:1545379095498727546>',
  four: '<:four:1545379083872112641>',
  five: '<:five:1545379011876622386>',
  six: '<:six:1545379093250310185>',
  seven: '<:seven:1545379091287506994>',
  eight: '<:eight:1545379009846706196>',
  nine: '<:nine:1545379086174527530>',

  // UI Elements
  alert: '<a:alert:1545148996434137149>',
  typing: '<a:typing:1545149057503207497>',
  statustyping: '<:statustyping:1545155645630582794>',
  people: '<:people:1545149032303689768>',
  link: '<:link:1545149023701180566>',
  card_back: '<:card_back:1549652972219277372>',

  // Coin Flip
  heads: '<:heads:1555524163853226025>',
  tails: '<:tails:1555524166264823891>',
  coinflip: '<a:coinflip:1555521942205767711>',

  // Personality
  purplebomb: '<a:purplebomb:1545149042378407986>',
  staff: '<a:staff:1545149054936289345>',
  smash: '<:smash:1545149052017049751>',
  gunpoint: '<:gunpoint:1545149018160631868>',
  chad: '<:chad:1558506939477004370>',

  // Special Effects
  pixelsymbolupside: '<:pixelsymbolupside:1545149037135536168>',
  pixelsymboltop: '<:pixelsymboltop:1545149034593910886>',
  confettipopper: '<:confettipopper:1545132978139693227>',

  // Quote Themes
  classic: '<:classic:1556312273360785460>',
  white: '<:white:1556312307217211532>',
  sunset: '<:sunset:1556312304566403152>',
  purple: '<:purple:1556312294533767208>',
  aurora: '<:aurora:1556312073665904651>',
  gold: '<:gold:1556312283158806548>',
  cherry: '<:cherry:1556312268759769118>',
  midnight: '<:midnight:1556312290226077926>',
  plasma: '<:plasma:1556312292411318383>',
  emerald: '<:emerald:1556312280130527264>',
  rose: '<:rose:1556312298887315466>',
  ember: '<:ember:1556312278129840239>',
  sapphire: '<:sapphire:1556312302347620413>',
  coral: '<:coral:1556312275688751116>',
  lime: '<:lime:1556312287319691405>',

  // Playing Cards
  joker: '<:joker:1549653063801901096>',
  spades_ace: '<:spades_ace:1549653084333019277>',
  spades_2: '<:spades_2:1549653065982812262>',
  spades_3: '<:spades_3:1549653067895410719>',
  spades_4: '<:spades_4:1549653069908803685>',
  spades_5: '<:spades_5:1549653071884329140>',
  spades_6: '<:spades_6:1549653073981481020>',
  spades_7: '<:spades_7:1549653076229754910>',
  spades_8: '<:spades_8:1549653078251278346>',
  spades_9: '<:spades_9:1549653080121937920>',
  spades_10: '<:spades_10:1549653082114236506>',
  spades_jack: '<:spades_jack:1549653086765580329>',
  spades_queen: '<:spades_queen:1549653090729197588>',
  spades_king: '<:spades_king:1549653088724451448>',
  hearts_ace: '<:hearts_ace:1545653055761416253>',
  hearts_2: '<:hearts_2:1549653037914525716>',
  hearts_3: '<:hearts_3:1549653039881654412>',
  hearts_4: '<:hearts_4:1549653041714561024>',
  hearts_5: '<:hearts_5:1549653043572777001>',
  hearts_6: '<:hearts_6:1549653045627850832>',
  hearts_7: '<:hearts_7:1549653047548973107>',
  hearts_8: '<:hearts_8:1549653049717293117>',
  hearts_9: '<:hearts_9:1549653051730829384>',
  hearts_10: '<:hearts_10:1545653053706080256>',
  hearts_jack: '<:hearts_jack:1545653057607045140>',
  hearts_queen: '<:hearts_queen:1545653061859934278>',
  hearts_king: '<:hearts_king:1545653059687153704>',
  diamonds_ace: '<:diamonds_ace:1549653029911928912>',
  diamonds_2: '<:diamonds_2:1549653001814147142>',
  diamonds_3: '<:diamonds_3:1549653003630284850>',
  diamonds_4: '<:diamonds_4:1549653005673172993>',
  diamonds_5: '<:diamonds_5:1549653007950544936>',
  diamonds_6: '<:diamonds_6:1549653010039181472>',
  diamonds_7: '<:diamonds_7:1549653012073414666>',
  diamonds_8: '<:diamonds_8:1549653021863059506>',
  diamonds_9: '<:diamonds_9:1549653023922331649>',
  diamonds_10: '<:diamonds_10:1549653025902039150>',
  diamonds_jack: '<:diamonds_jack:1549653031992299520>',
  diamonds_queen: '<:diamonds_queen:1549653035989475368>',
  diamonds_king: '<:diamonds_king:1549653033925742612>',
  clubs_ace: '<:clubs_ace:1549652993312563220>',
  clubs_2: '<:clubs_2:1549652974278672394>',
  clubs_3: '<:clubs_3:1549652976090615890>',
  clubs_4: '<:clubs_4:1549652978183442452>',
  clubs_5: '<:clubs_5:1549652980737773649>',
  clubs_6: '<:clubs_6:1549652982637920256>',
  clubs_7: '<:clubs_7:1549652984617508864>',
  clubs_8: '<:clubs_8:1549652986794348604>',
  clubs_9: '<:clubs_9:1549652988895690792>',
  clubs_10: '<:clubs_10:1549652991211085884>',
  clubs_jack: '<:clubs_jack:1549652995334213664>',
  clubs_queen: '<:clubs_queen:1549652999675314376>',
  clubs_king: '<:clubs_king:1549652997737291847>',

  // Other Items
  fish: '<:fish:1545829053041217579>',
  rod: '<:rod:1545829042115313744>',
  swords: '<:swords:1545829039074320564>',
  cd: '<:cd:1545149009855778848>',
  pass: '<:pass:1545149029573329007>',
  alarm1: '<:alarm1:1545148991782518844>',
  cargando: '<:cargando:1545149001983197364>',

  // Action Buttons
  tick: '<:tick:1558430105120804884>',
  cross: '<:cross:1558430092043096154>',
  arrow_left: '<:leftarrow:1558430098841935872>',
  arrow_right: '<:rightarrow:1558430102755213405>',
  arrow_prev: '<:leftarrow:1558430098841935872>',

  // Category Icons
  trophy_icon: '<:trophy:1545135066148118628>',
  pin: '<:pushpin:1558430101069365378>',
  chat: '<:chatbubble:1558430089560068206>',
  box: '<:box:1558430086125068328>',
  game: '<:controller:1545149011894210642>',
  crown: '<:dcrown:1545829050847862784>',
  talent: '<:people:1545149032303689768>', // Using people emoji for talent (static)
  gambling: '<:slots:1545149049328640120>',
  gambling_static: '<:slotsbanana:1545161905574903868>', // Static version for buttons

  // Status Icons
  warning: '<:warning:1558430107087933511>',
  clock: '<:alarm1:1545148991782518844>',
  hourglass: '<:cargando:1545149001983197364>',
  fire: '<:fire:1558430096807952384>',
  money: '<:moneybag:1545149026528268308>',
  sword: '<:swords:1545829039074320564>',

  // Unicode emojis that need custom versions (not available in portal yet)
  // These will be kept as Unicode for now until custom emojis are uploaded
  chart_up: '📈',
  chart_down: '📉',
  skull: '💀',
  eyes: '👁️',
  lightning: '⚡',
  toilet: '🧱',
  salute: '🫡',
  spy: '🗿',
  cry: '😭',
  money_wings: '💸',
  hand_emoji: '🤝',
  briefcase: '💼',
  running: '🏃‍♂️',
  mask: '🎭',
  money_bag: '💵',
  gem: '💎',
  glasses: '👓',
  red_circle: '🔴',
  sleep: '💤',
  detective: '🔎',
  blue_square: '🟦',
  pump: '💦',
} as const;

export type EmojiKey = keyof typeof EMOJIS;
