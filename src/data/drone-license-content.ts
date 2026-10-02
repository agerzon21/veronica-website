/**
 * The words on the drone licence page (src/components/AdminDroneLicense.tsx),
 * in both languages. Vero reads the admin in Russian; the test itself is in
 * English only, so the English names of things (FTN, IACRA, Exam ID, LAANC)
 * are kept in the Russian text too, because those are the words on the forms.
 *
 * SOURCED, AND DATED. Every fact here was checked on 2026-10-01 against the
 * FAA (faa.gov, ecfr.gov, iacra.faa.gov, faasafety.gov), PSI's own FAA exam
 * site and bulletin, and the Federal Register. The ones that can move are the
 * test fee, the Oct 26, 2026 change to the test, PSI's booking site (moving to
 * a new portal "in fall 2026"), the TSA and card waiting times, and the
 * airspace around Wilkes-Barre/Scranton (redrawn May 14, 2026). Re-check those
 * before relying on this page much after October 2026.
 *
 * Not legal advice, and it says so on the page where it matters (flying over
 * guests, local no-fly zones): the rule text and the FAA's apps decide.
 */

import type { DroneStepKey } from './drone-license';

export type L = { en: string; ru: string };
export interface DroneLink {
  label: L;
  href: string;
}
export interface DroneStepText {
  title: L;
  /** One line under the title while the step is not done. */
  summary: L;
  time?: L;
  cost?: L;
  todo: L[];
  links?: DroneLink[];
  notes?: L[];
}

export const DRONE_INTRO: { lead: L[]; facts: Array<{ label: L; value: L }> } = {
  lead: [
    {
      en: 'Flying a drone for pay needs the FAA Remote Pilot Certificate (Part 107). That includes drone shots inside a paid package, even ones given as a free extra. Until the certificate is printed, no drone footage for clients.',
      ru: 'Чтобы снимать дроном за деньги, нужен сертификат пилота FAA (Part 107). Это касается и кадров с дрона внутри платного пакета, даже если они идут бесплатным бонусом. Пока сертификат не распечатан, никаких съёмок с дрона для клиентов.',
    },
    {
      en: 'It is one multiple-choice test at a test center, then an online application. Each step below says what to do, links to where it is done, and has boxes for the numbers it gives you. Later steps show those numbers back, so nothing has to be remembered.',
      ru: 'Это один тест с вариантами ответов в тестовом центре, а потом заявка онлайн. В каждом шаге ниже написано, что сделать, есть ссылки, куда идти, и поля для номеров, которые выдаёт этот шаг. Следующие шаги сами показывают эти номера, ничего не нужно запоминать.',
    },
  ],
  facts: [
    {
      label: { en: 'Cost', ru: 'Стоимость' },
      value: { en: '$175 for the test, plus $5 per drone', ru: '$175 за тест и $5 за каждый дрон' },
    },
    {
      label: { en: 'Study', ru: 'Подготовка' },
      value: { en: 'About 20 hours, e.g. 1.5 hours a day for two weeks', ru: 'Около 20 часов, например по 1,5 часа в день две недели' },
    },
    {
      label: { en: 'The test', ru: 'Тест' },
      value: {
        en: '60 questions in 2 hours, 70% to pass, in English only',
        ru: '60 вопросов за 2 часа, нужно 70%, только на английском',
      },
    },
    {
      label: { en: 'Where', ru: 'Где' },
      value: {
        en: 'PSI Scranton, 1125 Lackawanna Trail, Clarks Summit, about 25 miles (40 minutes) from home',
        ru: 'PSI Scranton, 1125 Lackawanna Trail, Clarks Summit, около 40 км (40 минут) от дома',
      },
    },
    {
      label: { en: 'Test before', ru: 'Сдать до' },
      value: {
        en: 'Oct 26, 2026, when chart-image questions are added. Ideally by Oct 9, leaving room for a retake.',
        ru: '26 октября 2026: после этой даты в тесте появятся вопросы с картинками карт. Лучше до 9 октября, чтобы оставалось время пересдать.',
      },
    },
    {
      label: { en: 'How hard', ru: 'Сложность' },
      value: {
        en: 'Moderate: 83% passed in 2025, average score 79%',
        ru: 'Средняя: в 2025 году сдали 83%, средний балл 79%',
      },
    },
  ],
};

export const DRONE_STEP_TEXT: Record<DroneStepKey, DroneStepText> = {
  eligibility: {
    title: { en: 'Check that you can apply', ru: 'Проверить, что можно подавать' },
    summary: { en: 'Age, English, health, and the ID you will need', ru: 'Возраст, английский, здоровье и нужные документы' },
    time: { en: '5 minutes', ru: '5 минут' },
    cost: { en: 'Free', ru: 'Бесплатно' },
    todo: [
      {
        en: 'At least 16 years old, and able to read, speak, write and understand English (passing the test is how you show it).',
        ru: 'Не меньше 16 лет, умение читать, говорить, писать и понимать по-английски (сдача теста и есть подтверждение).',
      },
      {
        en: 'No physical or mental condition you know of that would make flying unsafe. No FAA medical exam is needed.',
        ru: 'Нет известных тебе проблем со здоровьем, из-за которых полёт был бы опасен. Медкомиссия FAA не нужна.',
      },
      {
        en: 'Check your photo ID: it must be current and show your photo, date of birth, signature and home address. If it shows no home address, bring a utility bill or lease too. A passport alone works for citizens and green card holders; anyone else needs a passport AND a US driver\'s license or other government ID.',
        ru: 'Проверь документ с фото: он должен быть действующим, с фото, датой рождения, подписью и домашним адресом. Если адреса нет, возьми ещё счёт за коммунальные услуги или договор аренды. Гражданам и владельцам грин-карты хватит паспорта; остальным нужен паспорт И американские права или другой госдокумент.',
      },
      {
        en: 'Use exactly the same spelling of your name everywhere: IACRA, PSI and the ID. A mismatch holds up the certificate.',
        ru: 'Пиши имя одинаково везде: в IACRA, в PSI и как в документе. Если написание не совпадает, сертификат задержат.',
      },
    ],
    notes: [
      {
        en: 'Registering the drone (step 9) needs a US citizen or permanent resident as owner. If that is not you, register it in Alex\'s name, or ask before buying.',
        ru: 'Для регистрации дрона (шаг 9) владелец должен быть гражданином США или иметь грин-карту. Если это не про тебя, регистрируем на Алекса, или спроси до покупки.',
      },
      {
        en: 'A drug conviction or refusing an alcohol test can delay the certificate for up to a year.',
        ru: 'Судимость по наркотикам или отказ от теста на алкоголь могут задержать сертификат до года.',
      },
    ],
  },

  ftn: {
    title: { en: 'Create an IACRA account and get your FTN', ru: 'Создать аккаунт IACRA и получить FTN' },
    summary: { en: 'The FAA number you need to book the test', ru: 'Номер FAA, без которого не записаться на тест' },
    time: { en: '15 minutes', ru: '15 минут' },
    cost: { en: 'Free', ru: 'Бесплатно' },
    todo: [
      {
        en: 'Open IACRA and click "Register" at the top right.',
        ru: 'Открой IACRA и нажми «Register» справа вверху.',
      },
      {
        en: 'Tick the "Applicant" role, then "Agree to TOS and Continue". Leave the certificate section empty: you have none yet.',
        ru: 'Отметь роль «Applicant», потом «Agree to TOS and Continue». Раздел про сертификат оставь пустым: его пока нет.',
      },
      {
        en: 'Fill in your details exactly as on your ID. Social Security number is optional ("Do Not Use" is fine). Use an email address no other IACRA account uses.',
        ru: 'Заполни данные точно как в документе. Номер соцстрахования не обязателен (можно «Do Not Use»). Email должен быть не занят другим аккаунтом IACRA.',
      },
      {
        en: 'Choose a username, password and security question, then click "Register".',
        ru: 'Придумай логин, пароль и секретный вопрос, нажми «Register».',
      },
      {
        en: 'Your FTN appears on screen and in an email: one letter and seven digits. Write it below.',
        ru: 'FTN появится на экране и придёт на почту: одна буква и семь цифр. Запиши его ниже.',
      },
    ],
    links: [
      { label: { en: 'IACRA', ru: 'IACRA' }, href: 'https://iacra.faa.gov/IACRA/Default.aspx' },
      {
        label: { en: 'FAA: becoming a drone pilot', ru: 'FAA: как стать пилотом дрона' },
        href: 'https://www.faa.gov/uas/commercial_operators/become_a_drone_pilot',
      },
    ],
  },

  study: {
    title: { en: 'Study for the test', ru: 'Подготовиться к тесту' },
    summary: { en: 'About 20 hours, mostly rules and airspace', ru: 'Около 20 часов, в основном правила и воздушное пространство' },
    time: { en: 'About 20 hours over 1 to 2 weeks', ru: 'Около 20 часов за одну или две недели' },
    cost: { en: 'Free, or $159 to $299 for a course', ru: 'Бесплатно, или от $159 до $299 за курс' },
    todo: [
      {
        en: 'The test weighs: rules 48%, flight operations 25%, airspace 20%, weather 5%, loading and performance 2%. Spend your time the same way.',
        ru: 'Вес тем в тесте: правила 48%, полёты 25%, воздушное пространство 20%, погода 5%, загрузка и характеристики 2%. Распредели время так же.',
      },
      {
        en: 'Read the FAA study guide, and with it the FAA\'s guidance AC 107-2A: the guide is from 2016 and does not cover the newer rules on flying over people, night flight and Remote ID.',
        ru: 'Прочитай учебник FAA и вместе с ним руководство AC 107-2A: учебник 2016 года, в нём нет новых правил о полётах над людьми, ночью и про Remote ID.',
      },
      {
        en: 'Practise reading charts with the testing supplement booklet (the same one you get at the test) and the FAA sample questions.',
        ru: 'Тренируйся читать карты по сборнику-приложению (такой же дадут на тесте) и по примерам вопросов FAA.',
      },
      {
        en: 'Take practice tests until you score 85% or more more than once. Write your best score below.',
        ru: 'Проходи пробные тесты, пока не наберёшь 85% или больше несколько раз подряд. Лучший результат запиши ниже.',
      },
    ],
    links: [
      {
        label: { en: 'FAA study guide (PDF)', ru: 'Учебник FAA (PDF)' },
        href: 'https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/remote_pilot_study_guide.pdf',
      },
      {
        label: { en: 'AC 107-2A, the current rules explained', ru: 'AC 107-2A, разбор текущих правил' },
        href: 'https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_107-2A.pdf',
      },
      {
        label: { en: 'FAA sample questions', ru: 'Примеры вопросов FAA' },
        href: 'https://www.faa.gov/sites/faa.gov/files/training_testing/testing/test_questions/uag_questions.pdf',
      },
      {
        label: { en: 'Testing supplement (charts)', ru: 'Приложение к тесту (карты)' },
        href: 'https://www.faa.gov/training_testing/testing/supplements',
      },
      {
        label: { en: 'What the test covers (ACS)', ru: 'Что входит в тест (ACS)' },
        href: 'https://www.faa.gov/training_testing/testing/acs/uas_acs.pdf',
      },
      {
        label: { en: 'Pilot Institute free resources', ru: 'Бесплатные материалы Pilot Institute' },
        href: 'https://pilotinstitute.com/free-drone-resources/',
      },
      {
        label: { en: 'Pilot Institute course ($159)', ru: 'Курс Pilot Institute ($159)' },
        href: 'https://pilotinstitute.com/course/part-107-remote-pilot/',
      },
    ],
    notes: [
      {
        en: 'The most-missed question type: which drones may fly over people (the "categories" and the Declaration of Compliance). The hardest areas: weather reports (METAR, TAF) and sectional charts.',
        ru: 'Чаще всего ошибаются в вопросах о том, какие дроны могут летать над людьми («категории» и Declaration of Compliance). Самое сложное: погодные сводки (METAR, TAF) и авиационные карты.',
      },
      {
        en: 'The test is in English only and dictionaries are not allowed, so learn the terms in English. No Russian study material exists that we could find.',
        ru: 'Тест только на английском, словари запрещены, поэтому учи термины по-английски. Материалов на русском мы не нашли.',
      },
      {
        en: 'Pilot Institute\'s course comes with a pass guarantee. Avoid old free videos: anything from before 2021 misses rules that are on the test.',
        ru: 'У курса Pilot Institute есть гарантия сдачи. Старые бесплатные видео не подходят: всё, что до 2021 года, не содержит правил, которые есть в тесте.',
      },
    ],
  },

  book: {
    title: { en: 'Book the test with PSI', ru: 'Записаться на тест в PSI' },
    summary: { en: 'PSI in Clarks Summit, 40 minutes from home; book before Oct 26', ru: 'PSI в Clarks Summit, 40 минут от дома; запишись на дату до 26 октября' },
    time: { en: '10 minutes', ru: '10 минут' },
    cost: { en: '$175 (plus tax, if PSI adds it)', ru: '$175 (плюс налог, если PSI его добавит)' },
    todo: [
      {
        en: 'Sign in at PSI\'s FAA site (create an account the first time) with your FTN from step 2.',
        ru: 'Зайди на сайт PSI для FAA (в первый раз создай аккаунт) с номером FTN из шага 2.',
      },
      {
        en: 'Choose the exam "Unmanned Aircraft General - Small (UAG)".',
        ru: 'Выбери экзамен «Unmanned Aircraft General - Small (UAG)».',
      },
      {
        en: 'Pick "PSI Examination Services - Scranton" (1125 Lackawanna Trail, Clarks Summit), a date and a time, and pay $175.',
        ru: 'Выбери «PSI Examination Services - Scranton» (1125 Lackawanna Trail, Clarks Summit), дату и время, оплати $175.',
      },
      {
        en: 'Pick a date before Oct 26 and before your trip. Ideally by Oct 9: a failed attempt can be retaken only 14 days later.',
        ru: 'Выбирай дату до 26 октября и до поездки. Лучше до 9 октября: после неудачи пересдать можно только через 14 дней.',
      },
      {
        en: 'Write the date, time, center and the confirmation number from PSI\'s email (from faa_support@psionline.com) below.',
        ru: 'Запиши ниже дату, время, центр и номер подтверждения из письма PSI (от faa_support@psionline.com).',
      },
    ],
    links: [
      { label: { en: 'PSI: book the FAA test', ru: 'PSI: запись на тест FAA' }, href: 'https://faa.psiexams.com/faa/login' },
      {
        label: { en: 'PSI test rules (PDF)', ru: 'Правила теста PSI (PDF)' },
        href: 'https://media.psiexams.com/faa/UAG_Information_Bulletin.pdf',
      },
    ],
    notes: [
      {
        en: 'Other centers if Clarks Summit is full, by drive from home: BCY Testing Solution, Allentown (61 mi); Commonwealth University, Bloomsburg (63 mi); AVNA Learning Center, Johnson City NY (79 mi). If no seats show, PSI\'s site has "request a seat".',
        ru: 'Если в Clarks Summit нет мест, по расстоянию от дома: BCY Testing Solution, Allentown (98 км); Commonwealth University, Bloomsburg (101 км); AVNA Learning Center, Johnson City NY (127 км). Если мест нет вообще, на сайте PSI есть «request a seat».',
      },
      {
        en: 'Rescheduling or cancelling needs at least 24 hours\' notice. PSI\'s phone: 844-704-1487.',
        ru: 'Перенести или отменить можно не позже чем за 24 часа. Телефон PSI: 844-704-1487.',
      },
      {
        en: 'PSI is moving FAA bookings to a new site this fall. If the link looks different, the test itself is the same.',
        ru: 'Этой осенью PSI переводит запись на новый сайт. Если ссылка выглядит иначе, сам тест не меняется.',
      },
    ],
  },

  test: {
    title: { en: 'Take the test', ru: 'Сдать тест' },
    summary: { en: '60 questions, 2 hours, 70% to pass', ru: '60 вопросов, 2 часа, нужно 70%' },
    time: { en: '2 hours, plus 15 minutes early', ru: '2 часа и прийти на 15 минут раньше' },
    todo: [
      {
        en: 'Arrive 15 minutes early with your photo ID (step 1).',
        ru: 'Приди на 15 минут раньше с документом с фото (шаг 1).',
      },
      {
        en: 'The center gives you the chart booklet, scratch paper and a pencil, and the test has a calculator built in. You may bring a plotter, a flight computer (E6B) and a basic calculator, if its memory is cleared in front of the proctor.',
        ru: 'В центре дадут сборник с картами, бумагу и карандаш, а в самом тесте есть калькулятор. Можно принести плоттер, навигационный калькулятор (E6B) и простой калькулятор, если при экзаменаторе очистить его память.',
      },
      {
        en: 'Not allowed in the room: phone, watch, wallet, your own pens, food or drink, a coat or hoodie, a shirt with pockets, a hat, and any dictionary.',
        ru: 'В зал нельзя: телефон, часы, кошелёк, свои ручки, еду и воду, куртку или худи, рубашку с карманами, шапку и любой словарь.',
      },
      {
        en: 'You get a printed score report (the AKTR) right after. Keep it safe: it has the 17-digit Exam ID that step 6 needs. Write the date, score and Exam ID below.',
        ru: 'Сразу после теста выдадут распечатку с результатом (AKTR). Береги её: на ней 17-значный Exam ID для шага 6. Запиши ниже дату, балл и Exam ID.',
      },
    ],
    notes: [
      {
        en: 'If you do not pass: wait 14 days, bring the failed report, and book again ($175 each time). The report shows which topics you missed.',
        ru: 'Если не сдала: подожди 14 дней, возьми распечатку с результатом и запишись снова ($175 каждый раз). В распечатке видно, по каким темам были ошибки.',
      },
      {
        en: 'A pass can be used to apply for 24 months.',
        ru: 'По сданному тесту можно подать заявку в течение 24 месяцев.',
      },
    ],
  },

  apply: {
    title: { en: 'Apply for the certificate in IACRA', ru: 'Подать заявку на сертификат в IACRA' },
    summary: { en: 'Two or three days after the test, with your Exam ID', ru: 'Через 2 или 3 дня после теста, с Exam ID' },
    time: { en: '20 minutes', ru: '20 минут' },
    cost: { en: 'Free', ru: 'Бесплатно' },
    todo: [
      {
        en: 'Wait two or three days after the test: that is how long the result takes to reach IACRA.',
        ru: 'Подожди 2 или 3 дня после теста: столько результат идёт в IACRA.',
      },
      {
        en: 'In IACRA: "Start New Application", Application Type "Pilot", Certifications "Remote Pilot", then "Other Path Information" and "Start Application".',
        ru: 'В IACRA: «Start New Application», Application Type «Pilot», Certifications «Remote Pilot», потом «Other Path Information» и «Start Application».',
      },
      {
        en: 'Your details are filled in already: "Save & Continue". Answer the English and drug-conviction questions.',
        ru: 'Твои данные уже заполнены: «Save & Continue». Ответь на вопросы про английский и судимость по наркотикам.',
      },
      {
        en: 'Under "Basis of Issuance", enter your ID details, search for the 17-digit Exam ID shown above and click "Associate Test".',
        ru: 'В разделе «Basis of Issuance» введи данные документа, найди 17-значный Exam ID (он показан выше) и нажми «Associate Test».',
      },
      {
        en: 'Review, sign the Pilot\'s Bill of Rights page, then "Sign and Complete". Nothing has to be mailed. Write the date below.',
        ru: 'Проверь, подпиши страницу Pilot\'s Bill of Rights, затем «Sign and Complete». Ничего отправлять по почте не нужно. Запиши дату ниже.',
      },
    ],
    links: [{ label: { en: 'IACRA', ru: 'IACRA' }, href: 'https://iacra.faa.gov/IACRA/Default.aspx' }],
    notes: [
      {
        en: 'This can be done from anywhere, the trip included: all it needs is the Exam ID and an internet connection.',
        ru: 'Это можно сделать откуда угодно, в том числе в поездке: нужны только Exam ID и интернет.',
      },
    ],
  },

  temporary: {
    title: { en: 'Print the temporary certificate', ru: 'Распечатать временный сертификат' },
    summary: { en: 'After the TSA check, about 1 to 2 weeks', ru: 'После проверки TSA, примерно через одну или две недели' },
    time: { en: 'About 7 days to 2 weeks of waiting', ru: 'Ждать от 7 дней до 2 недель' },
    cost: { en: 'Free', ru: 'Бесплатно' },
    todo: [
      {
        en: 'The TSA runs a background check on its own. The FAA emails you when it is done.',
        ru: 'TSA сама проводит проверку. Когда закончит, FAA пришлёт письмо.',
      },
      {
        en: 'Follow that email to print the temporary certificate from IACRA. From that moment you can fly for pay.',
        ru: 'По ссылке из письма распечатай временный сертификат из IACRA. С этого момента можно снимать за деньги.',
      },
      {
        en: 'Keep the printout in the drone case. Write the date and the certificate number below.',
        ru: 'Держи распечатку в кейсе с дроном. Запиши ниже дату и номер сертификата.',
      },
    ],
    notes: [
      {
        en: 'It is valid for 120 days or until the plastic card arrives, whichever is first. The page works out the date for you.',
        ru: 'Он действует 120 дней или до прихода пластиковой карточки, что наступит раньше. Дату страница посчитает сама.',
      },
    ],
  },

  card: {
    title: { en: 'Receive the permanent card', ru: 'Получить постоянную карточку' },
    summary: { en: 'By mail, about 7 weeks behind right now', ru: 'По почте, сейчас очередь около 7 недель' },
    time: { en: 'About 7 to 10 weeks after the temporary one', ru: 'От 7 до 10 недель после временного' },
    cost: { en: 'Free', ru: 'Бесплатно' },
    todo: [
      {
        en: 'Nothing to do but wait for the mail. When it arrives, the card replaces the printout in the drone case.',
        ru: 'Нужно только дождаться письма. Когда придёт, карточка заменит распечатку в кейсе с дроном.',
      },
      {
        en: 'If you move, tell the FAA your new address within 30 days.',
        ru: 'Если переедешь, сообщи FAA новый адрес в течение 30 дней.',
      },
    ],
    links: [
      {
        label: { en: 'FAA: where the card backlog stands', ru: 'FAA: какая сейчас очередь на карточки' },
        href: 'https://www.faa.gov/licenses_certificates/airmen_certification',
      },
    ],
  },

  register: {
    title: { en: 'Register the drone in DroneZone', ru: 'Зарегистрировать дрон в DroneZone' },
    summary: { en: '$5 per drone for 3 years; can be done any time', ru: '$5 за дрон на 3 года; можно сделать в любой момент' },
    time: { en: '15 minutes', ru: '15 минут' },
    cost: { en: '$5 per drone, lasts 3 years', ru: '$5 за дрон, на 3 года' },
    todo: [
      {
        en: 'In DroneZone, open "Drone Owners and Pilots", then the Part 107 dashboard (not the recreational one: under Part 107 every drone is registered, even small ones).',
        ru: 'В DroneZone открой «Drone Owners and Pilots», потом раздел Part 107 (не любительский: по Part 107 регистрируется каждый дрон, даже маленький).',
      },
      {
        en: 'Manage Device Inventory, "Add Device", answer "Yes" to Remote ID, choose "Standard Remote ID" (most current DJI drones have it built in) or "broadcast module", enter the Remote ID serial number, and pay.',
        ru: 'Manage Device Inventory, «Add Device», на вопрос про Remote ID ответь «Yes», выбери «Standard Remote ID» (у большинства современных DJI он встроен) или «broadcast module», введи серийный номер Remote ID и оплати.',
      },
      {
        en: 'Label the registration number on the outside of the drone, legible and firmly attached, before it next flies.',
        ru: 'Наклей регистрационный номер снаружи на дрон, чтобы было читаемо и держалось крепко, до следующего полёта.',
      },
      {
        en: 'Write the model, registration number, date and Remote ID serial below.',
        ru: 'Запиши ниже модель, регистрационный номер, дату и серийный номер Remote ID.',
      },
    ],
    links: [
      { label: { en: 'FAA DroneZone', ru: 'FAA DroneZone' }, href: 'https://faadronezone-access.faa.gov/' },
      {
        label: { en: 'Is my drone Remote ID compliant?', ru: 'Есть ли у моего дрона Remote ID?' },
        href: 'https://uasdoc.faa.gov/listDocs?docType=rid&status=accepted',
      },
      { label: { en: 'FAA: Remote ID', ru: 'FAA: Remote ID' }, href: 'https://www.faa.gov/uas/getting_started/remote_id' },
    ],
    notes: [
      {
        en: 'The owner must be a US citizen or permanent resident (see step 1).',
        ru: 'Владелец должен быть гражданином США или иметь грин-карту (см. шаг 1).',
      },
      {
        en: 'Buying a new drone: since Dec 2025 new foreign-made models (new DJI models included) cannot get FCC approval. Models approved before that are still fine to buy and fly.',
        ru: 'Если покупать новый дрон: с декабря 2025 новые иностранные модели (включая новые DJI) не получают одобрение FCC. Модели, одобренные раньше, можно покупать и летать.',
      },
      {
        en: 'If anything on the registration changes, update it within 14 days.',
        ru: 'Если что-то в регистрации изменится, обнови её в течение 14 дней.',
      },
    ],
  },

  fly: {
    title: { en: 'Before every paid flight', ru: 'Перед каждым платным полётом' },
    summary: { en: 'Airspace, people, and what to carry', ru: 'Воздушное пространство, люди и что иметь при себе' },
    todo: [
      {
        en: 'Check the venue in a LAANC app (Aloft is free). Near Wilkes-Barre/Scranton airport you need permission for some areas, usually granted in seconds. Downtown Scranton, Green Ridge, South Side and Dunmore are under the airport\'s extended airspace; Clarks Summit is outside it. Check every venue anyway.',
        ru: 'Проверь площадку в приложении с LAANC (Aloft бесплатно). Рядом с аэропортом Wilkes-Barre/Scranton для части мест нужно разрешение, обычно его дают за секунды. Центр Скрантона, Green Ridge, South Side и Dunmore попадают в расширенную зону аэропорта; Clarks Summit вне её. Всё равно проверяй каждую площадку.',
      },
      {
        en: 'Never fly at: the Scranton Army Ammunition Plant (South Side), Tobyhanna Army Depot, Steamtown or the Delaware Water Gap (national parks), or a state park outside its marked drone area (Lackawanna State Park has one). Pocono Raceway is off limits on race days.',
        ru: 'Никогда не летай: у Scranton Army Ammunition Plant (South Side), Tobyhanna Army Depot, в Steamtown и Delaware Water Gap (нацпарки), в госпарках вне отведённых для дронов мест (в Lackawanna State Park такое есть). Pocono Raceway закрыт в дни гонок.',
      },
      {
        en: 'Stay under 400 feet, keep the drone in sight, at least 3 miles visibility, and give way to any aircraft.',
        ru: 'Не выше 120 метров (400 футов), дрон всегда в поле зрения, видимость не меньше 5 км, любым самолётам уступай дорогу.',
      },
      {
        en: 'Do not fly over the guests unless the drone qualifies (under 0.55 lb with nothing attached, or an FAA-accepted category). Keep to the side of the crowd, and never hover over moving cars like the getaway car.',
        ru: 'Не летай над гостями, если дрон этого не допускает (легче 250 г вместе со всем, что на нём, или принятая FAA категория). Держись сбоку от людей и никогда не зависай над движущимися машинами, например над машиной молодожёнов.',
      },
      {
        en: 'Golden hour after sunset needs anti-collision lights visible for 3 miles.',
        ru: 'После заката (золотой час, сумерки) нужны проблесковые огни, видимые за 5 км.',
      },
      {
        en: 'No alcohol for 8 hours before flying: the reception toast waits.',
        ru: 'Никакого алкоголя за 8 часов до полёта: тост на банкете подождёт.',
      },
      {
        en: 'Carry the certificate (printout or card) and your photo ID, and have the drone\'s registration on your phone. Show them if the FAA or police ask.',
        ru: 'Имей при себе сертификат (распечатку или карточку) и документ с фото, а регистрацию дрона в телефоне. Покажи, если попросят FAA или полиция.',
      },
    ],
    links: [
      { label: { en: 'Aloft (free LAANC app)', ru: 'Aloft (бесплатное приложение LAANC)' }, href: 'https://www.aloft.ai/feature/laanc/' },
      {
        label: { en: 'FAA airspace map', ru: 'Карта воздушного пространства FAA' },
        href: 'https://faa.maps.arcgis.com/apps/webappviewer/index.html?id=9c2e4406710048e19806ebf6a06754ad',
      },
      {
        label: { en: 'FAA: flying over people', ru: 'FAA: полёты над людьми' },
        href: 'https://www.faa.gov/uas/commercial_operators/operations_over_people',
      },
    ],
    notes: [
      {
        en: 'Flying abroad: Part 107 covers the US only. Check the destination country\'s drone rules before packing the drone.',
        ru: 'За границей Part 107 не действует. Перед тем как брать дрон в поездку, проверь правила той страны.',
      },
      {
        en: 'Report any serious injury, or more than $500 of damage, to the FAA within 10 days.',
        ru: 'О серьёзной травме или ущербе больше $500 нужно сообщить в FAA в течение 10 дней.',
      },
      {
        en: 'Fines have a new fast track since April 2026. When in doubt about a venue or a shot, do not fly.',
        ru: 'С апреля 2026 штрафы выписывают по ускоренной процедуре. Если сомневаешься в площадке или кадре, не летай.',
      },
    ],
  },

  recurrent: {
    title: { en: 'Refresher training every 2 years', ru: 'Повторное обучение раз в 2 года' },
    summary: { en: 'A free online course keeps the certificate valid', ru: 'Бесплатный онлайн-курс продлевает право летать' },
    time: { en: 'About 1 to 2 hours, online', ru: 'Час или два, онлайн' },
    cost: { en: 'Free', ru: 'Бесплатно' },
    todo: [
      {
        en: 'Before the date shown above, take "Part 107 Small UAS Recurrent (ALC-677)" on FAASafety.gov and keep the completion certificate with your pilot certificate.',
        ru: 'До даты, указанной выше, пройди «Part 107 Small UAS Recurrent (ALC-677)» на FAASafety.gov и держи сертификат о прохождении вместе с сертификатом пилота.',
      },
      {
        en: 'Write the day you finished below. The next deadline is worked out from it.',
        ru: 'Запиши ниже, когда закончила. Следующий срок посчитается от этой даты.',
      },
    ],
    links: [
      {
        label: { en: 'ALC-677 on FAASafety.gov', ru: 'ALC-677 на FAASafety.gov' },
        href: 'https://www.faasafety.gov/gslac/ALC/CourseLanding.aspx?cID=677',
      },
    ],
    notes: [
      {
        en: 'The FAA counts calendar months: training any day in October 2026 keeps you current through the end of October 2028.',
        ru: 'FAA считает календарными месяцами: обучение в любой день октября 2026 действует до конца октября 2028.',
      },
    ],
  },
};

export const DRONE_FIELD_TEXT: Record<string, { label: L; placeholder?: L; help?: L }> = {
  ftn: {
    label: { en: 'FTN', ru: 'FTN' },
    placeholder: { en: 'C1234567', ru: 'C1234567' },
    help: { en: 'One letter and seven digits', ru: 'Одна буква и семь цифр' },
  },
  iacraUsername: {
    label: { en: 'IACRA username', ru: 'Логин IACRA' },
    help: { en: 'The username only, never the password', ru: 'Только логин, никогда не пароль' },
  },
  practiceScore: {
    label: { en: 'Best practice score (%)', ru: 'Лучший пробный результат (%)' },
    placeholder: { en: '88', ru: '88' },
  },
  studyNotes: {
    label: { en: 'Notes', ru: 'Заметки' },
    placeholder: { en: 'Topics to review', ru: 'Темы, которые повторить' },
  },
  testDate: { label: { en: 'Test date', ru: 'Дата теста' } },
  testTime: { label: { en: 'Time', ru: 'Время' }, placeholder: { en: '9:00 AM', ru: '9:00' } },
  testCenter: {
    label: { en: 'Test center', ru: 'Тестовый центр' },
    placeholder: { en: 'PSI Scranton, Clarks Summit', ru: 'PSI Scranton, Clarks Summit' },
  },
  bookingRef: { label: { en: 'PSI confirmation number', ru: 'Номер подтверждения PSI' } },
  passedOn: { label: { en: 'Date passed', ru: 'Дата сдачи' } },
  score: { label: { en: 'Score (%)', ru: 'Балл (%)' }, placeholder: { en: '85', ru: '85' } },
  examId: {
    label: { en: 'Exam ID', ru: 'Exam ID' },
    help: { en: '17 digits, on the printed score report', ru: '17 цифр, на распечатке с результатом' },
  },
  appliedOn: { label: { en: 'Date applied', ru: 'Дата подачи' } },
  tempIssuedOn: { label: { en: 'Date issued', ru: 'Дата выдачи' } },
  certificateNumber: {
    label: { en: 'Certificate number', ru: 'Номер сертификата' },
    help: { en: 'As printed on the certificate', ru: 'Как напечатано в сертификате' },
  },
  cardReceivedOn: { label: { en: 'Card arrived', ru: 'Карточка пришла' } },
  droneModel: {
    label: { en: 'Drone', ru: 'Дрон' },
    placeholder: { en: 'DJI Mavic 3', ru: 'DJI Mavic 3' },
  },
  registrationNumber: {
    label: { en: 'Registration number', ru: 'Регистрационный номер' },
    help: { en: 'Starts with FA', ru: 'Начинается с FA' },
  },
  registeredOn: { label: { en: 'Date registered', ru: 'Дата регистрации' } },
  remoteIdSerial: { label: { en: 'Remote ID serial', ru: 'Серийный номер Remote ID' } },
  trainedOn: { label: { en: 'Last finished', ru: 'Последний раз пройдено' } },
};

export const DRONE_DATE_TEXT = {
  applyBy: { en: 'Apply by (the pass is valid 24 months)', ru: 'Подать заявку до (результат действует 24 месяца)' },
  tempValidUntil: { en: 'Temporary certificate valid until', ru: 'Временный сертификат действует до' },
  renewBy: { en: 'Renew the registration by', ru: 'Продлить регистрацию до' },
  recurrentDue: { en: 'Refresher training due by', ru: 'Пройти повторное обучение до' },
} satisfies Record<string, L>;
