/**
 * Admin copy for the travel fee, in both panel languages.
 *
 * WHY THIS IS NOT IN src/i18n/admin.ts
 * Two reasons. The small one is that the dictionary is being edited by other
 * work as this lands and a shared file is the easiest merge to get wrong. The
 * load bearing one is that src/data/travel-fee.ts is imported by an API handler
 * (api/admin/_travel-link.ts), and api/admin.ts imports every admin handler, so
 * anything the travel code reaches is loaded by the whole admin API on every
 * cold start. Keeping the strings in a separate component side module means the
 * serverless function gets the arithmetic and the URL builders and none of the
 * dictionary. If this is ever folded back into the main dictionary, keep the
 * arithmetic module free of that import.
 *
 * Vero's panel defaults to Russian, so the Russian strings are the ones she
 * will actually read. They are written as full sentences rather than as
 * translations of English shorthand.
 */

export type TravelLang = 'ru' | 'en';

export interface TravelCopy {
  // ── The travel block on the new client form ──
  heading: string;
  lookItUp: string;
  lookItUpHelp: string;
  noAddressYet: string;
  linkFailed: string;
  originMissing: string;
  milesLabel: string;
  milesHelp: string;
  milesPlaceholder: string;
  minutesLabel: string;
  minutesHelp: string;
  minutesPlaceholder: string;
  roundTrip: (roundTripMiles: string) => string;
  driveTime: (oneWay: string, roundTrip: string) => string;
  withinRadius: (includedMiles: string) => string;

  // ── The offer ──
  offerHeading: string;
  offerMath: (
    roundTripMiles: string,
    billableMiles: string,
    includedMiles: string,
    rawFee: string,
    fee: string,
  ) => string;
  offerShare: (fee: string, pct: string) => string;
  offerShareNoTotal: (fee: string) => string;
  /** The same percentage once it is large enough to be worth arguing with. */
  shareWarn: (fee: string, pct: string, limit: string) => string;
  accept: (fee: string) => string;
  decline: string;

  // ── After she has decided ──
  acceptedHeading: string;
  acceptedLine: (fee: string, roundTripMiles: string) => string;
  remove: string;
  declinedLine: string;
  offerAgain: string;

  // ── Long haul: advice sitting ABOVE the offer, never replacing it ──
  longHaulHeading: string;
  longHaulBody: (fee: string) => string;

  // ── The typo guard, which is the only thing that refuses now ──
  implausibleHeading: string;
  implausibleBody: string;

  // ── The totals line the client will sign for ──
  totals: (sessionTotal: string, travelFee: string, contractTotal: string) => string;

  // ── Navigate buttons on the client screen ──
  navHeading: string;
  openIn: string;
  waze: string;
  googleMaps: string;
  appleMaps: string;
}

const EN: TravelCopy = {
  heading: 'Travel',
  lookItUp: 'Look it up',
  lookItUpHelp:
    'Opens Google Maps directions from your base to the address above. Read the distance and the drive time off the screen and type them in here.',
  noAddressYet: 'Fill in the session location above first.',
  linkFailed: 'Could not build the link. Open Google Maps by hand.',
  originMissing:
    'No base address is set on the server, so Maps will measure from wherever this device is. Check the starting point before you trust the distance.',
  milesLabel: 'Distance one way (miles)',
  milesHelp:
    'What Maps prints for the trip out. The first 60 miles each way are included in every booking, and the fee is worked out on the round trip at $0.70 a mile beyond the 120 miles that covers.',
  milesPlaceholder: '103',
  minutesLabel: 'Drive time one way',
  minutesHelp:
    'Type it the way Maps prints it, "2 hr 2 min", or just the minutes. It never changes the fee, which comes from the miles alone. It decides whether you are told to price a hotel night in, and it is what catches a mistyped distance.',
  minutesPlaceholder: '2 hr 2 min',
  roundTrip: (m) => `${m} miles round trip.`,
  driveTime: (one, round) => `About ${one} each way, ${round} on the road.`,
  withinRadius: (included) => `Inside the ${included} miles included in every booking. No travel fee.`,

  offerHeading: 'Add a travel fee?',
  offerMath: (roundTrip, billable, included, rawFee, fee) =>
    `${roundTrip} miles round trip is ${billable} beyond the ${included} included. At $0.70 a mile that is ${rawFee}, rounded up to ${fee}.`,
  offerShare: (fee, pct) => `${fee}, ${pct}% of this session.`,
  offerShareNoTotal: (fee) => `${fee}. Enter a session total above to see what share of it that is.`,
  shareWarn: (fee, pct, limit) =>
    `${fee} is ${pct}% of this session, over the ${limit}% worth a second look. The rate is the same for every booking, so what this is really saying is that the session is small for the distance. Consider raising the session price or letting the travel go.`,
  accept: (fee) => `Add ${fee} to the total`,
  decline: 'No travel fee',

  acceptedHeading: 'Travel fee added',
  acceptedLine: (fee, miles) => `${fee} for ${miles} miles round trip. It is printed in the contract.`,
  remove: 'Remove',
  declinedLine: 'No travel fee on this booking.',
  offerAgain: 'Offer it again',

  longHaulHeading: 'Three hours each way. Treat the fee below as a floor.',
  longHaulBody: (fee) =>
    `${fee} pays for the driving and nothing else, and it is still yours to accept below. Before you send it, price in a hotel night (budget $150), a second night if the day ends late, meals, and the second shooter's travel if one is coming.`,

  implausibleHeading: 'Check these two numbers',
  implausibleBody:
    'The distance and the drive time do not agree with each other, or one of them is past anything you would drive in a day. Nothing has been filled in, because this is what a stray digit looks like. Correct them, or clear the drive time, and the offer comes back.',

  totals: (session, travel, total) =>
    `Session ${session} plus travel ${travel}. The client signs for ${total}.`,

  navHeading: 'Session location',
  openIn: 'Open in',
  waze: 'Waze',
  googleMaps: 'Google Maps',
  appleMaps: 'Apple Maps',
};

const RU: TravelCopy = {
  heading: 'Дорога',
  lookItUp: 'Посмотреть на карте',
  lookItUpHelp:
    'Откроет маршрут в Google Maps от вашей базы до адреса выше. Посмотрите расстояние и время в пути и впишите их сюда.',
  noAddressYet: 'Сначала заполните место съёмки выше.',
  linkFailed: 'Не удалось собрать ссылку. Откройте Google Maps вручную.',
  originMissing:
    'На сервере не задан адрес базы, поэтому карта посчитает от текущего места этого устройства. Проверьте точку старта, прежде чем доверять расстоянию.',
  milesLabel: 'Расстояние в одну сторону (мили)',
  milesHelp:
    'То, что показывает карта на путь туда. Первые 60 миль в одну сторону включены в любую съёмку, а доплата считается по дороге туда и обратно, по $0.70 за милю сверх этих 120 миль.',
  milesPlaceholder: '103',
  minutesLabel: 'Время в пути в одну сторону',
  minutesHelp:
    'Введите так, как показывает Карты, "2 ч 2 мин", или просто минуты. На сумму это не влияет: деньги считаются только по милям. Время решает, напомним ли мы заложить ночь в отеле, и именно оно ловит опечатку в расстоянии.',
  minutesPlaceholder: '2 ч 2 мин',
  roundTrip: (m) => `${m} миль туда и обратно.`,
  driveTime: (one, round) => `Примерно ${one} в одну сторону, ${round} за рулём всего.`,
  withinRadius: (included) =>
    `В пределах ${included} миль, которые включены в любую съёмку. Доплаты за дорогу нет.`,

  offerHeading: 'Добавить доплату за дорогу?',
  offerMath: (roundTrip, billable, included, rawFee, fee) =>
    `${roundTrip} миль туда и обратно, это на ${billable} больше включённых ${included}. По $0.70 за милю выходит ${rawFee}, с округлением вверх ${fee}.`,
  offerShare: (fee, pct) => `${fee}, это ${pct}% от суммы съёмки.`,
  offerShareNoTotal: (fee) => `${fee}. Укажите сумму съёмки выше, чтобы увидеть долю.`,
  shareWarn: (fee, pct, limit) =>
    `${fee} это ${pct}% от суммы съёмки, больше ${limit}%, на которые стоит обратить внимание. Ставка одинакова для всех поездок, так что на деле это значит, что съёмка мала для такого расстояния. Подумайте, не поднять ли цену съёмки или не отказаться ли от доплаты.`,
  accept: (fee) => `Добавить ${fee} к сумме`,
  decline: 'Без доплаты',

  acceptedHeading: 'Доплата за дорогу добавлена',
  acceptedLine: (fee, miles) => `${fee} за ${miles} миль туда и обратно. Это напечатано в договоре.`,
  remove: 'Убрать',
  declinedLine: 'Доплаты за дорогу по этой съёмке нет.',
  offerAgain: 'Предложить снова',

  longHaulHeading: 'Три часа в одну сторону. Сумма ниже это минимум.',
  longHaulBody: (fee) =>
    `${fee} покрывает только дорогу, и принять эту сумму по-прежнему можно ниже. Прежде чем отправлять, заложите ночь в отеле (примерно $150), вторую ночь, если день закончится поздно, еду и дорогу второго фотографа, если он едет.`,

  implausibleHeading: 'Проверьте эти два числа',
  implausibleBody:
    'Расстояние и время в пути не сходятся друг с другом, либо одно из них больше того, что можно проехать за день. Ничего не подставлено, потому что так выглядит лишняя цифра. Исправьте их или очистите время в пути, и предложение вернётся.',

  totals: (session, travel, total) =>
    `Съёмка ${session} плюс дорога ${travel}. Клиент подписывает ${total}.`,

  navHeading: 'Место съёмки',
  openIn: 'Открыть в',
  waze: 'Waze',
  googleMaps: 'Google Maps',
  appleMaps: 'Apple Maps',
};

export function travelCopy(lang: TravelLang): TravelCopy {
  return lang === 'ru' ? RU : EN;
}
