import { Box, Flex, Grid, GridItem, Image, Input, Text, Textarea } from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import { m, useInView } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CTAButton from '../components/ui/CTAButton';
import PageHeader from '../components/ui/PageHeader';
import { prefetchChunk } from '../components/ChunkErrorBoundary';
import ContactRail, { SectionHead } from '../components/ContactRail';
import weddingData from '../data/wedding-page.json';

const MotionDiv = m.div;

/**
 * The three wedding packages, by name. The weddings page links each card to
 * /contact?package=<name>, and the value is matched against this list so a
 * crafted URL cannot inject text. Coverage and price are read from the same
 * file the weddings page renders, so what the plate quotes is what they saw.
 *
 * The server re-resolves all of this from the name at submit time; nothing
 * priced is ever taken from the browser.
 */
const PACKAGES = weddingData.packages as Array<{
  name: string;
  price: string;
  coverage: string;
}>;

/**
 * Used only when someone arrives on a cold link or refreshes: the weddings
 * page hands the real photograph over in history state, which does not survive
 * either. Any wedding photograph reads correctly here, so this is one slug
 * rather than a second copy of that page's curated list.
 */
const FALLBACK_PHOTO = '/assets/photos/weddings/loving-wedding-embrace-bw.webp';

const SHOOT_TYPES = [
  { value: 'Wedding Photography', label: 'Wedding' },
  { value: 'Portrait Session', label: 'Portrait' },
  { value: 'Family Session', label: 'Family' },
  { value: 'Maternity Session', label: 'Maternity' },
  { value: 'Other', label: 'Other' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const GREETING = (name: string) => `We're interested in the ${name} package.`;
const PROMPT_LINE = 'Our plans so far: ';
const BLANKS = `\n\n${PROMPT_LINE}`;
const prefillFor = (name: string) => GREETING(name) + BLANKS;

/**
 * Finds OUR opening sentence so it can be swapped or removed without touching
 * anything the visitor wrote. Three properties, each learned from a real bug:
 *
 *   m       so it still matches when they have typed ABOVE our line. Anchored
 *           to line one, Remove silently did nothing and the package stayed.
 *   stem    so a visitor's own line ending in "package." is not mistaken for
 *           ours, deleted on Remove and overwritten on a swap.
 *   lazy    so it stops at the FIRST "package.", ours. Greedy, it ran on to
 *           the last one and swallowed a sentence they wrote after it.
 *
 * The trailing whitespace is captured rather than discarded so a following
 * word keeps the space that separated it.
 */
const GREETING_LINE = /^[^\n]*?\binterested in the[^\n]*?\bpackage\.([ \t]*\n?)/m;

type FieldName = 'name' | 'email' | 'shoot_type' | 'message';
type FieldState = '' | 'valid' | 'error';

const Contact = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(contentRef, { once: true, amount: 0.15 });
  const navigate = useNavigate();
  const location = useLocation();

  // ThankYou is a lazy route, so submitting would otherwise fetch a chunk
  // between the POST and the Google Ads conversion firing. Warm it on arrival.
  useEffect(() => {
    prefetchChunk(() => import('./ThankYou'));
  }, []);

  // ── the carried package ────────────────────────────────────────────────
  const initialPackage = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('package');
    return PACKAGES.find((p) => p.name === raw) ?? null;
  }, []);

  const [pkg, setPkg] = useState(initialPackage);
  // Handed over by the weddings page in history state, so the plate shows the
  // very photograph they tapped. Not a query parameter: that is editable by
  // anyone, and an arbitrary URL in an <img src> is an injection.
  const navState = location.state as
    | { packagePhoto?: string; packageFocus?: string }
    | null;
  const platePhoto = navState?.packagePhoto ?? FALLBACK_PHOTO;
  const plateFocus = navState?.packageFocus ?? 'center';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');
  const [place, setPlace] = useState('');
  const [message, setMessage] = useState(initialPackage ? prefillFor(initialPackage.name) : '');
  const [shootType, setShootType] = useState(initialPackage ? 'Wedding Photography' : '');

  const [state, setState] = useState<Record<FieldName, FieldState>>({
    name: '', email: '', shoot_type: '', message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [typing, setTyping] = useState(false);

  // Is the bar hovering over the form, or has it landed at its natural place?
  // It matters visually: floating on a background the same colour as the page,
  // it reads as the bottom of the page and hides the fact that there is more
  // to scroll to. Observed on the trust line directly beneath it, so there is
  // no scroll listener.
  const [floating, setFloating] = useState(true);
  const trustRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = trustRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      setFloating(!entry.isIntersecting && entry.boundingClientRect.top > 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Below lg the bar stands down while a text field has focus, because iOS
  // Safari mispositions bottom-pinned elements over the on-screen keyboard.
  // Synced from the FORM rather than from each field, and read one tick later,
  // because blur fires before the next focus: a per-field handler would flash
  // the bar off and on every time you moved between fields. Setting it only
  // on focus is worse still, which is what this replaced: the flag latched
  // true on the first tap and never cleared, so on a phone the submit bar
  // disappeared for good and the form could not be sent at all.
  // setTimeout rather than requestAnimationFrame: rAF does not fire in
  // headless Chrome, which would make this impossible to test.
  const syncTyping = (e: { currentTarget: HTMLElement }) => {
    const form = e.currentTarget;
    window.setTimeout(() => {
      const el = document.activeElement as HTMLElement | null;
      setTyping(
        !!el &&
          form.contains(el) &&
          (el.tagName === 'TEXTAREA' ||
            (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'radio')),
      );
    }, 0);
  };

  // A carried package answers the question, so the chooser comes off screen
  // and a hidden input posts the value instead.
  const typeHidden = pkg !== null;
  const prefill = pkg ? prefillFor(pkg.name) : '';

  // ── validity ───────────────────────────────────────────────────────────
  const valid = useMemo(() => {
    const messageHasWords = prefill
      ? message.replace(GREETING_LINE, '').split(PROMPT_LINE).join('').trim().length > 0
      : message.trim().length > 0;
    return {
      name: name.trim().length > 0,
      email: EMAIL_RE.test(email.trim()),
      shoot_type: typeHidden ? true : shootType.length > 0,
      message: messageHasWords,
    };
  }, [name, email, shootType, message, prefill, typeHidden]);

  const requiredLeft = (Object.keys(valid) as FieldName[]).filter((k) => !valid[k]).length;

  const messageFor = (field: FieldName): string => ({
    name: 'Add your name',
    email: email.trim() ? 'That email does not look quite right' : 'Add an email so I can reply',
    shoot_type: 'Choose what you are booking',
    message: 'Tell me more about what you have in mind, so I can give you a helpful reply',
  }[field]);

  // Reward early, judge late: an errored field clears the moment it is right,
  // but a field is only marked wrong once they leave it.
  const judge = (field: FieldName, value: string) => {
    setState((s) => ({
      ...s,
      [field]: value.trim() ? (valid[field] ? 'valid' : 'error') : submitted ? 'error' : '',
    }));
  };
  const clearIfFixed = (field: FieldName) => {
    setState((s) => (s[field] === 'error' && valid[field] ? { ...s, [field]: 'valid' } : s));
  };

  // ── the package plate ──────────────────────────────────────────────────
  const removePackage = () => {
    // Take OUR sentence out and leave everything they wrote. If nothing of
    // theirs remains, clear the box rather than stranding an empty prompt.
    const rest = message.replace(GREETING_LINE, '').replace(/^\s+/, '');
    setMessage(rest.trim() === BLANKS.trim() ? '' : rest);
    setPkg(null);
    setShootType('Wedding Photography');
  };

  // ── submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);

    const missing = (Object.keys(valid) as FieldName[]).filter((k) => !valid[k]);
    if (missing.length) {
      setState((s) => {
        const next = { ...s };
        (Object.keys(valid) as FieldName[]).forEach((k) => {
          next[k] = valid[k] ? (k === 'shoot_type' ? '' : 'valid') : 'error';
        });
        return next;
      });
      document.getElementById(missing[0] === 'shoot_type' ? 'shoot_type_group' : missing[0])
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    setError('');

    // Only the package NAME goes up. The server resolves coverage and price
    // from its own copy of the data, so a tampered value cannot be quoted back.
    const payload = {
      name, email, shoot_type: shootType, date, location: place, message,
      package: pkg?.name ?? '',
      botcheck: '',
    };

    try {
      // Submit and WAIT before navigating. This used to fire from the
      // thank-you page after the route changed, and closing the tab or
      // backgrounding on mobile aborted it: the lead vanished from our side
      // while the customer saw a success page. Awaiting it closes that.
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({ success: false }));

      if (response.ok && data.success) {
        const submissionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        navigate('/contact/thank-you', {
          state: { submissionId, emailId: data.emailId ?? null },
        });
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── shared field styling ───────────────────────────────────────────────
  const fieldSx = (field: FieldName) => ({
    bg: 'white',
    border: '1px solid',
    borderColor:
      state[field] === 'error' ? 'red.600'
      : state[field] === 'valid' ? 'brand.success'
      : 'brand.field',
    borderRadius: 0,
    color: 'gray.800',
    fontSize: '16px',
    fontWeight: '300',
    // On the CONTROL, never the wrapper: the browser honours scroll-margin
    // only on the element it scrolls to, so on a wrapper it does nothing and
    // tabbing still parks the field behind the header or the submit bar.
    scrollMarginTop: '88px',
    scrollMarginBottom: '112px',
    _placeholder: { color: 'gray.500' },
    _focus: { borderColor: 'brand.accentText', boxShadow: 'accentFocus' },
  });

  const labelSx = {
    display: 'block',
    mb: 3,
    fontSize: '11px',
    fontWeight: '400',
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    color: 'brand.mutedText',
  };

  const errorLine = (field: FieldName) =>
    state[field] === 'error' && (
      <Text mt={3} fontSize="13px" color="red.600">
        {messageFor(field)}
      </Text>
    );

  return (
    <Box position="relative" minH="100vh" bg="brand.surface">
      <Helmet>
        <title>Book a Session | Vero Photography</title>
        <meta property="og:image" content="https://vero.photography/assets/photos/site/contact-bg.webp" />
      </Helmet>

      {/* Hero — the same band every other page opens with: 45vh / 53vh, the
          same veil, the same header ramp. */}
      <Box position="relative" h={{ base: '45vh', md: '53vh' }} overflow="hidden" bg="#3a342d">
        <Image
          src="/assets/photos/site/contact-bg.webp"
          alt=""
          w="100%"
          h="100%"
          objectFit="cover"
          objectPosition={{ base: '13% 30%', md: 'center 30%' }}
          fetchPriority="high"
        />
        <Box position="absolute" inset={0} bg="rgba(0,0,0,0.45)" />
        <Flex position="absolute" inset={0} align="center" justify="center" px={6} pt={{ base: '64px', md: '72px' }}>
          <Box maxW="46ch">
            <PageHeader
              onDark
              eyebrow="Get in touch"
              title="Book a session"
              lead="Tell me about your vision and let's create something beautiful together."
            />
          </Box>
        </Flex>
      </Box>

      <Box maxW="1120px" mx="auto" px={{ base: 5, md: 10 }} pt={{ base: 12, md: 16 }} pb={{ base: 16, md: '88px' }}>
        <MotionDiv
          ref={contentRef}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <Grid
            templateColumns={{ base: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 320px' }}
            // 72px explicitly, NOT a scale number. 18 is not a Chakra spacing
            // token, so it passed through as a literal 18px, and the submit
            // bar's -72px right margin then overshot the gap by 54px and
            // covered the rail.
            columnGap={{ lg: '72px' }}
            // The last row is flexible so the tall form column cannot inflate
            // the rows beside it. Without it the form's height is shared across
            // all three, pushing the rail down and leaving a hole at the top.
            templateRows={{ lg: 'auto auto 1fr' }}
            templateAreas={{
              base: `"plate" "col" "reserve" "reach"`,
              lg: `"col plate" "col reserve" "col reach"`,
            }}
          >
            {/* ── the package plate ── */}
            {pkg && (
              <GridItem area="plate" mb={{ base: 9, lg: 10 }} w="100%" maxW={{ base: '640px', lg: 'none' }} mx="auto">
                <Box position="relative" h={{ base: '200px', lg: '210px' }} overflow="hidden" bg="#3a342d">
                  <Image src={platePhoto} alt="" position="absolute" inset={0} w="100%" h="100%" objectFit="cover" objectPosition={plateFocus} />
                  <Box
                    position="absolute"
                    inset={0}
                    bg="linear-gradient(180deg, rgba(12,10,6,0.5) 0%, rgba(12,10,6,0.14) 32%, rgba(12,10,6,0.56) 62%, rgba(12,10,6,0.88) 100%)"
                  />
                  <Flex
                    as="button"
                    type="button"
                    onClick={removePackage}
                    position="absolute"
                    top={0}
                    right={0}
                    zIndex={2}
                    align="center"
                    gap={2}
                    minH="44px"
                    px={3.5}
                    color="white"
                    fontSize="10px"
                    letterSpacing="0.16em"
                    textTransform="uppercase"
                    textShadow="0 1px 6px rgba(0,0,0,0.5)"
                    _hover={{ color: 'brand.accentSoft' }}
                  >
                    <Box as="span" aria-hidden="true">✕</Box> Remove
                  </Flex>
                  <Box position="absolute" left={0} right={0} bottom={0} zIndex={1} px={5} py={4}>
                    <Text fontSize="10px" letterSpacing="0.2em" textTransform="uppercase" color="brand.accentSoft">
                      Your package
                    </Text>
                    <Text fontFamily="heading" fontWeight="400" fontSize="28px" lineHeight="1.1" color="white" mt={1} textShadow="0 2px 14px rgba(0,0,0,0.45)">
                      {pkg.name}
                    </Text>
                    <Flex align="center" justify="space-between" gap={3} mt={1.5}>
                      <Text fontSize="13px" color="whiteAlpha.900">
                        {pkg.coverage} · {pkg.price}
                      </Text>
                      <Box
                        as="a"
                        href="/wedding-photography#packages"
                        flex="none"
                        fontSize="10px"
                        letterSpacing="0.16em"
                        textTransform="uppercase"
                        color="white"
                        borderBottom="1px solid"
                        borderColor="brand.accentSoft"
                        pb={0.5}
                      >
                        Change
                      </Box>
                    </Flex>
                  </Box>
                </Box>
              </GridItem>
            )}

            {/* ── form, submit bar and trust line travel together ── */}
            <GridItem area="col" minW={0} alignSelf="start">
              <Box
                as="form"
                onSubmit={handleSubmit}
                id="contact-form"
                w="100%"
                maxW={{ base: '640px', lg: 'none' }}
                mx="auto"
                // The other half of the bar's negative margin below.
                mb={{ base: '336px', lg: '332px' }}
                onFocus={syncTyping}
                onBlur={syncTyping}
              >
                {/* Honeypot. Bots fill it, humans never see it, and the API
                    returns a fake success when it arrives populated. */}
                <input type="hidden" name="botcheck" defaultValue="" />

                <Box mb={12}>
                  <SectionHead title="You" />
                  <Box>
                    <Text as="label" htmlFor="name" sx={labelSx}>
                      Full name <Text as="span" color="red.600" fontWeight="500">*</Text>
                    </Text>
                    <Input
                      id="name"
                      name="name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => { setName(e.target.value); clearIfFixed('name'); }}
                      onBlur={(e) => judge('name', e.target.value)}
                      h="48px"
                      sx={fieldSx('name')}
                    />
                    {errorLine('name')}
                  </Box>
                  <Box mt={6}>
                    <Text as="label" htmlFor="email" sx={labelSx}>
                      Email <Text as="span" color="red.600" fontWeight="500">*</Text>
                    </Text>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); clearIfFixed('email'); }}
                      onBlur={(e) => judge('email', e.target.value)}
                      h="48px"
                      sx={fieldSx('email')}
                    />
                    {errorLine('email')}
                  </Box>
                </Box>

                <Box mb={12}>
                  <SectionHead title="The session" />
                  {/* Hidden entirely while a package is carried: the package
                      already says this is a wedding, so offering to change it
                      to Maternity makes no sense. Removing it brings it back. */}
                  {typeHidden ? (
                    <input type="hidden" name="shoot_type" value={shootType} readOnly />
                  ) : (
                    <Box id="shoot_type_group" mb={6}>
                      <Text as="span" sx={labelSx}>
                        Type <Text as="span" color="red.600" fontWeight="500">*</Text>
                      </Text>
                      <Flex wrap="wrap" gap={2}>
                        {SHOOT_TYPES.map((t) => (
                          <Box
                            key={t.value}
                            as="button"
                            type="button"
                            onClick={() => { setShootType(t.value); setState((s) => ({ ...s, shoot_type: '' })); }}
                            aria-pressed={shootType === t.value}
                            display="flex"
                            alignItems="center"
                            minH={{ base: '44px', lg: '40px' }}
                            px={4}
                            fontSize="12px"
                            letterSpacing="0.1em"
                            textTransform="uppercase"
                            border="1px solid"
                            borderColor={shootType === t.value ? 'brand.accentText' : 'brand.field'}
                            bg={shootType === t.value ? 'brand.accentText' : 'white'}
                            color={shootType === t.value ? 'white' : 'gray.700'}
                            transition="background 0.2s, color 0.2s, border-color 0.2s"
                            sx={{ scrollMarginTop: '88px', scrollMarginBottom: '112px' }}
                          >
                            {t.label}
                          </Box>
                        ))}
                      </Flex>
                      {errorLine('shoot_type')}
                    </Box>
                  )}

                  <Grid templateColumns={{ base: 'minmax(0,1fr)', sm: 'minmax(0,1fr) minmax(0,1fr)' }} gap={6}>
                    <Box>
                      <Text as="label" htmlFor="date" sx={labelSx}>
                        Preferred date <Text as="span" textTransform="none" letterSpacing="0.02em" fontSize="12px" color="brand.mutedText">optional</Text>
                      </Text>
                      <Input
                        id="date"
                        name="date"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        h="48px"
                        sx={{
                          ...fieldSx('name'),
                          borderColor: 'brand.field',
                          // iOS lays a chosen date out by its own shadow-DOM
                          // defaults: pinned to the top of the box and centred.
                          // Both need overriding, and the value element needs
                          // the line height, not just the input.
                          height: '48px',
                          lineHeight: '46px',
                          textAlign: 'left',
                          '&::-webkit-date-and-time-value': {
                            height: '46px', lineHeight: '46px', margin: 0, textAlign: 'left',
                          },
                        }}
                      />
                    </Box>
                    <Box>
                      <Text as="label" htmlFor="location" sx={labelSx}>
                        Location <Text as="span" textTransform="none" letterSpacing="0.02em" fontSize="12px" color="brand.mutedText">optional</Text>
                      </Text>
                      <Input
                        id="location"
                        name="location"
                        autoComplete="off"
                        placeholder="Venue, town, address, or still deciding"
                        value={place}
                        onChange={(e) => setPlace(e.target.value)}
                        h="48px"
                        sx={fieldSx('name')}
                      />
                    </Box>
                  </Grid>
                </Box>

                <Box>
                  <SectionHead title="Your message" required />
                  <Textarea
                    id="message"
                    name="message"
                    rows={5}
                    placeholder="The day, your ideas, any questions"
                    value={message}
                    onChange={(e) => { setMessage(e.target.value); clearIfFixed('message'); }}
                    onBlur={(e) => judge('message', e.target.value)}
                    minH={{ base: '204px', md: '140px' }}
                    lineHeight="1.6"
                    p={3}
                    sx={fieldSx('message')}
                  />
                  {errorLine('message')}
                </Box>

                {error && (
                  <Text mt={6} fontSize="sm" color="red.600">
                    {error}
                  </Text>
                )}
              </Box>

              {/* The submit bar. OUTSIDE the form on purpose: a sticky element
                  can never leave its containing block, and inside the form that
                  block's top sits only a little above the fold on arrival,
                  which clamped the bar and left it hanging below the screen.
                  The button stays the form's submit through the form attribute.

                  margin-top is negative, and .form carries the same number as
                  margin-bottom above. A negative margin outsets the sticky
                  constraint rectangle so the bar can reach the bottom of the
                  viewport from the first pixel, on a short screen or a phone
                  held in landscape, without moving where it finally lands. */}
              <Flex
                direction="column"
                align="center"
                gap={2.5}
                position="sticky"
                bottom={0}
                zIndex={40}
                bg="brand.surface"
                mt="-300px"
                py={3.5}
                mx={{ base: -5, md: -10, lg: '-40px' }}
                px={{ base: 5, md: 10, lg: 0 }}
                sx={{
                  '@media (min-width: 62em)': {
                    // Reaches the rail on the right and past the fields on the
                    // left, so no field edge or error glow shows beside it. The
                    // right padding puts the button back on the form's centre.
                    marginRight: '-72px',
                    paddingRight: '32px',
                  },
                }}
                display={typing ? { base: 'none', lg: 'flex' } : 'flex'}
                borderTop="1px solid"
                borderTopColor={floating ? 'brand.accentBorder' : 'transparent'}
                boxShadow={floating ? '0 -12px 24px -20px rgba(40, 30, 10, 0.55)' : 'none'}
                transition="box-shadow 0.25s, border-color 0.25s"
                // A short fade above the bar while it floats, so the content
                // passing underneath is visible as content rather than reading
                // as the end of the page. Nothing once the bar has landed.
                _before={{
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  // Percentages on an absolutely positioned child resolve
                  // against the PADDING box, so a plain 100% would sit over
                  // the 1px hairline above and paint it out. The extra pixel
                  // lands the fade exactly on top of the border instead.
                  bottom: 'calc(100% + 1px)',
                  height: '28px',
                  pointerEvents: 'none',
                  opacity: floating ? 1 : 0,
                  transition: 'opacity 0.25s',
                  // brand.surface at zero alpha, NOT `transparent` — the
                  // keyword interpolates through rgba(0,0,0,0) and greys the
                  // middle of the fade.
                  bgGradient: 'linear(to-t, brand.surface, rgba(253, 249, 240, 0))',
                }}
              >
                <Text fontSize="13px" lineHeight="1.35" textAlign="center" color={requiredLeft === 0 ? 'brand.success' : 'brand.mutedText'} m={0} aria-live="polite">
                  {requiredLeft === 0 ? (
                    '✓ All set'
                  ) : (
                    <>
                      <Text as="span" color="red.600" fontWeight="500" aria-hidden="true">*</Text>
                      {` ${requiredLeft} required field${requiredLeft === 1 ? '' : 's'} left`}
                    </>
                  )}
                </Text>
                <Box w="100%" maxW="320px">
                  {/* Muted until the required fields are filled, but still
                      pressable: pressing it is what shows WHICH fields are
                      missing. A disabled submit tells you nothing, which is
                      why GOV.UK advises against it. */}
                  <CTAButton
                    type="submit"
                    form="contact-form"
                    variant={requiredLeft === 0 ? 'solid' : 'solidMuted'}
                    size="lg"
                    fullWidth
                    isLoading={isSubmitting}
                    loadingText="Sending..."
                  >
                    Check availability
                  </CTAButton>
                </Box>
              </Flex>

              <Flex ref={trustRef} align="center" justify="center" gap={2.5} wrap="wrap" mt={5} w="100%" maxW={{ base: '640px', lg: 'none' }} mx="auto">
                <Text textStyle="metaCaption" color="brand.mutedText">No obligation</Text>
                <Box w="3px" h="3px" borderRadius="full" bg="brand.accent" />
                <Text textStyle="metaCaption" color="brand.mutedText">Get a reply within 24 hours</Text>
              </Flex>
            </GridItem>

            {/* Shared with the thank-you page: it carries Veronika's contact
                details, and a phone number living in two page files is one that
                eventually gets changed in only one of them. */}
            <ContactRail />
          </Grid>
        </MotionDiv>
      </Box>
    </Box>
  );
};

export default Contact;
