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
  accept: (fee: string) => string;
  decline: string;

  // ── After she has decided ──
  acceptedHeading: string;
  acceptedLine: (fee: string, roundTripMiles: string) => string;
  remove: string;
  declinedLine: string;
  offerAgain: string;

  // ── The ceiling ──
  manualHeading: string;
  manualBody: (fee: string, ceiling: string) => string;

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
  milesHelp: 'What Maps prints for the trip out. The fee is worked out on the round trip.',
  milesPlaceholder: '53.2',
  minutesLabel: 'Drive time one way (minutes)',
  minutesHelp:
    'For your judgement only. Drive time is covered by the per mile rate and is never billed separately, so nothing here changes the fee.',
  minutesPlaceholder: '60',
  roundTrip: (m) => `${m} miles round trip.`,
  driveTime: (one, round) => `About ${one} each way, ${round} on the road.`,
  withinRadius: (included) => `Inside the ${included} miles included in every booking. No travel fee.`,

  offerHeading: 'Add a travel fee?',
  offerMath: (roundTrip, billable, included, rawFee, fee) =>
    `${roundTrip} miles round trip is ${billable} beyond the ${included} included. At $1.00 a mile that is ${rawFee}, rounded up to ${fee}.`,
  offerShare: (fee, pct) => `${fee}, ${pct}% of this session.`,
  offerShareNoTotal: (fee) => `${fee}. Enter a session total above to see what share of it that is.`,
  accept: (fee) => `Add ${fee} to the total`,
  decline: 'No travel fee',

  acceptedHeading: 'Travel fee added',
  acceptedLine: (fee, miles) => `${fee} for ${miles} miles round trip. It is printed in the contract.`,
  remove: 'Remove',
  declinedLine: 'No travel fee on this booking.',
  offerAgain: 'Offer it again',

  manualHeading: 'Quote this one by hand',
  manualBody: (fee, ceiling) =>
    `The formula gives ${fee}, which is over ${ceiling}. Nothing has been filled in. A trip this long is a conversation, not a line item, so agree a figure and type it into the total yourself.`,

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
  milesHelp: 'То, что показывает карта на путь туда. Доплата считается по дороге туда и обратно.',
  milesPlaceholder: '53.2',
  minutesLabel: 'Время в пути в одну сторону (минуты)',
  minutesHelp:
    'Только для вашей оценки. Время за рулём уже заложено в ставку за милю и отдельно не выставляется, так что на сумму это не влияет.',
  minutesPlaceholder: '60',
  roundTrip: (m) => `${m} миль туда и обратно.`,
  driveTime: (one, round) => `Примерно ${one} в одну сторону, ${round} за рулём всего.`,
  withinRadius: (included) =>
    `В пределах ${included} миль, которые включены в любую съёмку. Доплаты за дорогу нет.`,

  offerHeading: 'Добавить доплату за дорогу?',
  offerMath: (roundTrip, billable, included, rawFee, fee) =>
    `${roundTrip} миль туда и обратно, это на ${billable} больше включённых ${included}. По $1.00 за милю выходит ${rawFee}, с округлением вверх ${fee}.`,
  offerShare: (fee, pct) => `${fee}, это ${pct}% от суммы съёмки.`,
  offerShareNoTotal: (fee) => `${fee}. Укажите сумму съёмки выше, чтобы увидеть долю.`,
  accept: (fee) => `Добавить ${fee} к сумме`,
  decline: 'Без доплаты',

  acceptedHeading: 'Доплата за дорогу добавлена',
  acceptedLine: (fee, miles) => `${fee} за ${miles} миль туда и обратно. Это напечатано в договоре.`,
  remove: 'Убрать',
  declinedLine: 'Доплаты за дорогу по этой съёмке нет.',
  offerAgain: 'Предложить снова',

  manualHeading: 'Посчитайте эту поездку вручную',
  manualBody: (fee, ceiling) =>
    `По формуле выходит ${fee}, это больше ${ceiling}. Ничего не подставлено. Такая дальняя поездка обсуждается отдельно, так что договоритесь о сумме и впишите её в общую сумму сами.`,

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
