import { Box, VStack, Text, Flex, HStack, Icon, Input, Checkbox, useToast } from '@chakra-ui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FaCopy, FaSync, FaCheck, FaUndo } from 'react-icons/fa';
import SignatureCanvas from 'react-signature-canvas';
import type SignatureCanvasType from 'react-signature-canvas';
import ClientGallery, { type DriveFile, type FolderSection } from './ClientGallery';
import CTAButton from './ui/CTAButton';
import type { ContractTemplate } from '../data/contract-template';

// Full client portal payload — mirrors the shape returned by
// /api/portal/client. Each field group is annotated with which phase
// of the rollout populates / consumes it.
export interface ClientPortalData {
  mode: 'full';
  client_name: string | null;
  client_email: string;
  drive_url: string | null;
  rootFiles: DriveFile[];
  sections: FolderSection[];
  warning?: string;

  // Contract — Phase 2
  contract_status: 'none' | 'pending' | 'signed' | 'void';
  contract_signed_at: string | null;
  contract_body: string | null;
  contract_signed_pdf_available: boolean;

  // Payment — Phase 3
  contract_total_amount: number | null;
  contract_retainer_amount: number | null;
  paid_to_date: number;
  payment_plan_enabled: boolean;
  installments: Array<{
    installment_number: number;
    amount: number;
    due_date: string;
    paid_at: string | null;
    paid_amount: number | null;
    payment_method: string | null;
  }>;

  // Gallery Pass settings — Phase 1c
  gallery_password: string;
  gallery_enabled: boolean;

  // Gallery hosting — surfaced in the UI as the "available until" line
  gallery_delivered_at: string | null;
  gallery_expires_at: string | null;
}

interface ClientPortalViewProps {
  data: ClientPortalData;
  // Re-auth credentials for actions that mutate portal state (rotate the
  // Gallery Pass, sign the contract, etc.). The credentials live in the
  // Portal page's React state only — never persisted to storage — so a
  // tab refresh boots the client back to the login form. Acceptable for
  // this MVP; sessions can come later.
  credentials: { email: string; password: string };
  onDataUpdate: (data: ClientPortalData) => void;
}

const formatMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const ClientPortalView = ({ data, credentials, onDataUpdate }: ClientPortalViewProps) => {
  const remaining =
    data.contract_total_amount !== null
      ? data.contract_total_amount - data.paid_to_date
      : null;

  // ─── Gallery Pass management state ───
  const toast = useToast();
  const [gpUpdating, setGpUpdating] = useState(false);
  const [gpCustomOpen, setGpCustomOpen] = useState(false);
  const [gpCustomValue, setGpCustomValue] = useState('');
  const [gpError, setGpError] = useState('');
  const [gpCopied, setGpCopied] = useState(false);

  // Single helper for every gallery-pass action — auth + the action are
  // all server-side, this just dispatches and folds the new state back into
  // the parent's clientData so the rest of the view stays in sync.
  const callGalleryPass = async (
    body:
      | { action: 'rotate' }
      | { action: 'enable' }
      | { action: 'disable' }
      | { action: 'set'; customPassword: string },
  ): Promise<boolean> => {
    setGpUpdating(true);
    setGpError('');
    try {
      const res = await fetch('/api/portal/gallery-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, ...body }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        onDataUpdate({
          ...data,
          gallery_password: result.gallery_password,
          gallery_enabled: result.gallery_enabled,
        });
        return true;
      }
      setGpError(result.error || 'Could not update the gallery pass.');
      return false;
    } catch {
      setGpError('Could not reach the server. Please try again.');
      return false;
    } finally {
      setGpUpdating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.gallery_password);
      setGpCopied(true);
      setTimeout(() => setGpCopied(false), 2000);
    } catch {
      toast({
        title: 'Could not copy',
        description: 'Long-press the password to copy it manually.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleSetCustom = async () => {
    const trimmed = gpCustomValue.trim();
    if (trimmed.length < 4) {
      setGpError('Custom password must be at least 4 characters.');
      return;
    }
    const ok = await callGalleryPass({ action: 'set', customPassword: trimmed });
    if (ok) {
      setGpCustomOpen(false);
      setGpCustomValue('');
    }
  };

  return (
    <Box bg="white" minH="100vh" pt="72px">
      {/* ─── Header ─── */}
      <Box px={{ base: 4, md: 8 }} py={{ base: 8, md: 12 }} textAlign="center">
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="#c9a96e"
          mb={3}
        >
          Your Portal
        </Text>
        <Box w="40px" h="1px" bg="#c9a96e" mx="auto" mb={5} />
        <Text
          as="h1"
          fontSize={{ base: '2xl', md: '3xl' }}
          fontWeight="200"
          color="gray.800"
          letterSpacing="0.02em"
          m={0}
        >
          {data.client_name ? `Welcome, ${data.client_name}` : 'Welcome'}
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300" mt={2}>
          {data.client_email}
        </Text>
      </Box>

      {/* ─── Contract section ───
          Pending: shows the consent checkbox + signature pad + sign button.
          Signed: shows the date + a download link to the signed PDF (served
          via Drive's standard download endpoint).
          Other (none/void): empty.
      */}
      {data.contract_status === 'pending' && (
        <ContractSignSection
          credentials={credentials}
          contractBody={data.contract_body}
          onSigned={(updates) => onDataUpdate({ ...data, ...updates })}
        />
      )}
      {data.contract_status === 'signed' && data.contract_signed_at && (
        <SignedContractSection
          credentials={credentials}
          signedAt={data.contract_signed_at}
          pdfAvailable={data.contract_signed_pdf_available}
        />
      )}

      {/* ─── Payment / Balance section — Phase 3 fills this in fully.
            For now, surface the totals so it's visible end-to-end. ─── */}
      {data.contract_total_amount !== null && remaining !== null && (
        <Box py={{ base: 10, md: 12 }} px={6}>
          <VStack spacing={4} maxW="540px" mx="auto" textAlign="center">
            <Text
              fontSize="xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.25em"
              color="#c9a96e"
            >
              Balance
            </Text>
            <Box w="30px" h="1px" bg="#c9a96e" />
            <HStack
              spacing={{ base: 6, md: 10 }}
              divider={
                <Box w="1px" h="36px" bg="gray.200" alignSelf="center" />
              }
              flexWrap="wrap"
              justify="center"
            >
              <BalanceStat label="Paid" value={formatMoney(data.paid_to_date)} />
              <BalanceStat label="Total" value={formatMoney(data.contract_total_amount)} />
              <BalanceStat
                label="Remaining"
                value={formatMoney(remaining)}
                emphasize={remaining > 0}
              />
            </HStack>
            {data.payment_plan_enabled && data.installments.length > 0 && (
              <Box w="100%" pt={6}>
                <Text
                  fontSize="2xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.25em"
                  color="#c9a96e"
                  mb={4}
                >
                  Payment Schedule
                </Text>
                <VStack spacing={3} align="stretch">
                  {data.installments.map((inst) => {
                    const isPaid = inst.paid_at !== null;
                    const isOverdue =
                      !isPaid && new Date(inst.due_date) < new Date();
                    return (
                      <Flex
                        key={inst.installment_number}
                        align="center"
                        justify="space-between"
                        bg="white"
                        border="1px solid"
                        borderColor={isPaid ? 'green.200' : isOverdue ? 'red.200' : 'gray.200'}
                        borderRadius="sm"
                        px={4}
                        py={3}
                        textAlign="left"
                      >
                        <VStack align="start" spacing={0.5}>
                          <Text fontSize="xs" color="gray.500" fontWeight="500">
                            Installment {inst.installment_number}
                          </Text>
                          <Text fontSize="sm" color="gray.700" fontWeight="400">
                            {formatMoney(inst.amount)}
                            <Text as="span" color="gray.400" fontWeight="300">
                              {' · due '}
                              {formatDate(inst.due_date)}
                            </Text>
                          </Text>
                        </VStack>
                        <Text
                          fontSize="2xs"
                          fontWeight="500"
                          textTransform="uppercase"
                          letterSpacing="0.15em"
                          color={
                            isPaid ? 'green.500' : isOverdue ? 'red.500' : 'gray.500'
                          }
                        >
                          {isPaid
                            ? `Paid ${inst.payment_method ? `· ${inst.payment_method}` : ''}`
                            : isOverdue
                              ? 'Overdue'
                              : 'Upcoming'}
                        </Text>
                      </Flex>
                    );
                  })}
                </VStack>
              </Box>
            )}
          </VStack>
        </Box>
      )}

      {/* ─── Gallery hosting expiration banner — surfaces the retention
            window the contract specifies, so the client knows when they
            need to download by. ─── */}
      {data.gallery_expires_at && data.drive_url && (
        <Box bg="#fef9e6" borderTop="1px solid" borderColor="#f0e4b6" py={4} px={6}>
          <Text
            fontSize="xs"
            color="#7a6520"
            fontWeight="400"
            textAlign="center"
            letterSpacing="0.05em"
          >
            Your gallery is available until{' '}
            <Text as="span" fontWeight="600">
              {formatDate(data.gallery_expires_at)}
            </Text>
            . Download what you'd like to keep before then.
          </Text>
        </Box>
      )}

      {/* ─── Photos ─── */}
      {data.drive_url ? (
        <ClientGallery
          clientName={data.client_name}
          driveUrl={data.drive_url}
          rootFiles={data.rootFiles}
          sections={data.sections}
          warning={data.warning}
        />
      ) : (
        <Box py={20} px={6} textAlign="center" bg="white">
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            Your photos will appear here once they're ready.
          </Text>
        </Box>
      )}

      {/* ─── Gallery Pass management ───
          The client owns this control: rotate, disable entirely, or set a
          custom password. All server-side via /api/portal/gallery-pass,
          re-authenticated each call with the credentials passed down from
          the Portal page. */}
      <Box bg="gray.50" py={{ base: 12, md: 14 }} px={6} mt={6}>
        <VStack spacing={4} maxW="520px" mx="auto" textAlign="center">
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="#c9a96e"
          >
            Gallery Pass
          </Text>
          <Box w="30px" h="1px" bg="#c9a96e" />
          <Text fontSize="sm" color="gray.600" lineHeight="1.8" fontWeight="300">
            {data.gallery_enabled
              ? 'Share this password with guests so they can view your photos without your full Client Portal login.'
              : 'Gallery sharing is currently disabled. No one can view your photos with the password below.'}
          </Text>

          {/* Password chip with inline copy button */}
          <Flex
            align="center"
            justify="center"
            gap={3}
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="sm"
            px={5}
            py={3}
            opacity={data.gallery_enabled ? 1 : 0.6}
            transition="opacity 0.2s"
          >
            <Text
              fontSize="md"
              fontWeight="500"
              color="gray.800"
              fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
              letterSpacing="0.05em"
            >
              {data.gallery_password}
            </Text>
            <Box
              as="button"
              type="button"
              onClick={handleCopy}
              aria-label="Copy password"
              p={2}
              borderRadius="sm"
              color="gray.500"
              transition="all 0.2s"
              cursor="pointer"
              _hover={{ color: '#c9a96e', bg: 'gray.100' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={gpCopied ? FaCheck : FaCopy} boxSize={3.5} />
            </Box>
          </Flex>

          {/* Action row — rotate / toggle / custom */}
          <HStack spacing={3} pt={2} flexWrap="wrap" justify="center">
            <CTAButton
              onClick={() => callGalleryPass({ action: 'rotate' })}
              variant="outline"
              size="sm"
              icon={FaSync}
              isLoading={gpUpdating}
              isDisabled={!data.gallery_enabled}
            >
              Rotate
            </CTAButton>
            <CTAButton
              onClick={() =>
                callGalleryPass({ action: data.gallery_enabled ? 'disable' : 'enable' })
              }
              variant="outline"
              size="sm"
              isLoading={gpUpdating}
            >
              {data.gallery_enabled ? 'Disable sharing' : 'Enable sharing'}
            </CTAButton>
            <CTAButton
              onClick={() => setGpCustomOpen((open) => !open)}
              variant="outline"
              size="sm"
              isDisabled={!data.gallery_enabled || gpUpdating}
            >
              {gpCustomOpen ? 'Cancel' : 'Set custom'}
            </CTAButton>
          </HStack>

          {/* Custom-password input — collapses in when "Set custom" is open */}
          {gpCustomOpen && (
            <Flex
              gap={2}
              w="100%"
              maxW="420px"
              direction={{ base: 'column', sm: 'row' }}
              pt={3}
            >
              <Input
                value={gpCustomValue}
                onChange={(e) => setGpCustomValue(e.target.value.toUpperCase())}
                placeholder="ABCD1234"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                h="40px"
                bg="white"
                fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
                fontSize="sm"
                letterSpacing="0.05em"
                _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
              />
              <CTAButton
                onClick={handleSetCustom}
                variant="solid"
                size="sm"
                isLoading={gpUpdating}
                loadingText="Saving..."
              >
                Save
              </CTAButton>
            </Flex>
          )}

          {gpError && (
            <Text fontSize="xs" color="red.500" fontWeight="400" pt={1}>
              {gpError}
            </Text>
          )}
        </VStack>
      </Box>
    </Box>
  );
};

const BalanceStat = ({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) => (
  <VStack spacing={1}>
    <Text
      fontSize="2xs"
      fontWeight="500"
      textTransform="uppercase"
      letterSpacing="0.25em"
      color={emphasize ? '#c9a96e' : 'gray.400'}
    >
      {label}
    </Text>
    <Text
      fontSize={{ base: 'xl', md: '2xl' }}
      fontWeight={emphasize ? '400' : '200'}
      color={emphasize ? 'gray.800' : 'gray.600'}
    >
      {value}
    </Text>
  </VStack>
);

/**
 * Signed-state display + download. The PDF lives in a private Vercel Blob
 * store (no direct URL exposed to the browser), so the download button
 * re-auths via /api/portal/download-contract and streams the binary back,
 * which we then trigger a file save on via an in-memory object URL.
 */
function SignedContractSection({
  credentials,
  signedAt,
  pdfAvailable,
}: {
  credentials: { email: string; password: string };
  signedAt: string;
  pdfAvailable: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const handleDownload = async () => {
    setError('');
    setDownloading(true);
    try {
      const res = await fetch('/api/portal/download-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) {
        // Error responses are JSON; success is binary.
        const data = await res.json().catch(() => null);
        setError(data?.error || `Could not download (status ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Signed Contract.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[download-contract] network error:', err);
      setError('Could not reach the server. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Box
      bg="gray.50"
      borderTop="1px solid"
      borderBottom="1px solid"
      borderColor="gray.100"
      py={{ base: 10, md: 12 }}
      px={6}
    >
      <VStack spacing={4} maxW="500px" mx="auto" textAlign="center">
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="#c9a96e"
        >
          Contract
        </Text>
        <Box w="30px" h="1px" bg="#c9a96e" />
        <Icon as={FaCheck} color="green.500" boxSize={6} />
        <Text fontSize="sm" color="gray.600" lineHeight="1.8" fontWeight="300">
          Signed electronically on {formatDate(signedAt)}.
        </Text>
        {pdfAvailable && (
          <CTAButton
            onClick={handleDownload}
            variant="outline"
            size="sm"
            isLoading={downloading}
            loadingText="Preparing..."
          >
            Download Signed Copy
          </CTAButton>
        )}
        {error && (
          <Text fontSize="xs" color="red.500" fontWeight="400">
            {error}
          </Text>
        )}
      </VStack>
    </Box>
  );
}

/**
 * Pending-contract signing UI: typed full name + consent checkbox +
 * signature pad. Sends everything to /api/portal/sign-contract which
 * does the heavy lifting (PDF generation, Blob upload, email).
 *
 * Kept as its own component because it owns a fair amount of local state
 * (the signature canvas ref, the typed name, the consent flag, the
 * submitting/error states) — pulling it out keeps ClientPortalView
 * readable as a layout component.
 */
function ContractSignSection({
  credentials,
  contractBody,
  onSigned,
}: {
  credentials: { email: string; password: string };
  contractBody: string | null;
  onSigned: (updates: {
    contract_status: 'signed';
    contract_signed_at: string;
    contract_signed_pdf_available: boolean;
  }) => void;
}) {
  const sigPadRef = useRef<SignatureCanvasType | null>(null);
  const [signerName, setSignerName] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Parse the frozen contract body. If it's missing or malformed, we show a
  // friendly "being prepared" message rather than a sign form pointed at
  // nothing — the endpoint would 409 anyway, but the UI shouldn't promise
  // signing it can't deliver.
  const contract = useMemo<ContractTemplate | null>(() => {
    if (!contractBody) return null;
    try {
      return JSON.parse(contractBody) as ContractTemplate;
    } catch {
      return null;
    }
  }, [contractBody]);

  // Size the signature canvas to its rendered CSS size × devicePixelRatio.
  // Without this, the fixed internal pixel buffer doesn't match the
  // stretched CSS width — pointer events get coordinate-rounded, and the
  // bezier smoothing in signature_pad accumulates that error over long
  // strokes, producing visible drift between cursor and ink.
  useEffect(() => {
    if (!contract) return;
    const pad = sigPadRef.current;
    if (!pad) return;

    const resize = () => {
      const canvas = pad.getCanvas();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.clear();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [contract]);

  const handleClear = () => {
    sigPadRef.current?.clear();
  };

  const handleSign = async () => {
    setError('');
    if (!consent) {
      setError('Please confirm you intend to sign this contract electronically.');
      return;
    }
    if (signerName.trim().length < 2) {
      setError('Please type your full name to sign.');
      return;
    }
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      setError('Please draw your signature in the box.');
      return;
    }
    const signatureDataUrl = sigPadRef.current.toDataURL('image/png');

    setSubmitting(true);
    try {
      let res: Response;
      try {
        res = await fetch('/api/portal/sign-contract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...credentials,
            signer_name: signerName.trim(),
            signer_signature: signatureDataUrl,
            consent: true,
          }),
        });
      } catch (err) {
        // Genuine network failure (offline, DNS, etc). Distinct from a
        // server response we couldn't parse.
        console.error('[sign-contract] network error:', err);
        setError('Could not reach the server. Please check your connection and try again.');
        return;
      }

      // Read the response as text first so we can show *something* useful
      // even if the body isn't JSON (e.g. Vercel returning an HTML error
      // page). Logging both the status and the raw body to the console
      // makes the failure mode obvious in DevTools.
      const rawBody = await res.text();
      let data: { success?: boolean; error?: string; contract_signed_at?: string } | null = null;
      try {
        data = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        console.error('[sign-contract] non-JSON response', { status: res.status, rawBody });
        setError(`Server returned an unexpected response (status ${res.status}). Open the browser console for details.`);
        return;
      }

      if (res.ok && data?.success) {
        onSigned({
          contract_status: 'signed',
          contract_signed_at: data.contract_signed_at!,
          contract_signed_pdf_available: true,
        });
      } else {
        console.error('[sign-contract] server returned error', { status: res.status, data });
        setError(data?.error || `Could not sign the contract (status ${res.status}). Please try again.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!contract) {
    return (
      <Box
        bg="gray.50"
        borderTop="1px solid"
        borderBottom="1px solid"
        borderColor="gray.100"
        py={{ base: 12, md: 14 }}
        px={6}
      >
        <VStack spacing={4} maxW="500px" mx="auto" textAlign="center">
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="#c9a96e"
          >
            Contract
          </Text>
          <Box w="30px" h="1px" bg="#c9a96e" />
          <Text fontSize="sm" color="gray.600" lineHeight="1.8" fontWeight="300">
            Your contract is being prepared. We'll let you know as soon as it's
            ready to sign.
          </Text>
        </VStack>
      </Box>
    );
  }

  return (
    <Box
      bg="gray.50"
      borderTop="1px solid"
      borderBottom="1px solid"
      borderColor="gray.100"
      py={{ base: 12, md: 14 }}
      px={6}
    >
      <VStack spacing={6} maxW="640px" mx="auto">
        <VStack spacing={3}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="#c9a96e"
          >
            Your Contract
          </Text>
          <Box w="35px" h="1px" bg="#c9a96e" />
        </VStack>

        <Text
          fontSize="sm"
          color="gray.600"
          lineHeight="1.8"
          fontWeight="300"
          textAlign="center"
        >
          Please read the contract below. Once you sign, both you and Veronika
          will receive a copy by email, and the signed PDF will be available
          here to download any time.
        </Text>

        {/* Full contract body. The signature section is skipped — the form
            below replaces it. Page scroll carries the user through; we don't
            trap scroll inside a small box because that hides the document. */}
        <ContractBodyView contract={contract} />

        <VStack spacing={2} pt={2}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="#c9a96e"
          >
            Sign Below
          </Text>
          <Box w="35px" h="1px" bg="#c9a96e" />
        </VStack>

        {/* Typed full name — required for the audit trail */}
        <Box w="100%">
          <Text
            as="label"
            htmlFor="signer-name"
            display="block"
            fontSize="2xs"
            fontWeight="500"
            letterSpacing="0.2em"
            textTransform="uppercase"
            color="#c9a96e"
            mb={2}
          >
            Full Name
          </Text>
          <Input
            id="signer-name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Type your full name"
            h="48px"
            bg="white"
            _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
          />
        </Box>

        {/* Signature canvas */}
        <Box w="100%">
          <Flex justify="space-between" align="center" mb={2}>
            <Text
              fontSize="2xs"
              fontWeight="500"
              letterSpacing="0.2em"
              textTransform="uppercase"
              color="#c9a96e"
            >
              Draw Your Signature
            </Text>
            <Box
              as="button"
              type="button"
              onClick={handleClear}
              fontSize="2xs"
              letterSpacing="0.15em"
              textTransform="uppercase"
              color="gray.500"
              cursor="pointer"
              display="inline-flex"
              alignItems="center"
              gap={1.5}
              _hover={{ color: '#c9a96e' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={FaUndo} boxSize={2.5} />
              Clear
            </Box>
          </Flex>
          <Box
            bg="white"
            border="1px dashed"
            borderColor="gray.300"
            borderRadius="sm"
            overflow="hidden"
            sx={{
              // The canvas inside needs an explicit width to render
              // properly; we let the wrapper drive the visible area.
              '& canvas': {
                display: 'block',
                width: '100% !important',
                height: '180px !important',
                touchAction: 'none',
              },
            }}
          >
            <SignatureCanvas
              ref={sigPadRef}
              penColor="#2d2d2d"
              canvasProps={{
                style: { width: '100%', height: '180px', display: 'block' },
              }}
            />
          </Box>
        </Box>

        {/* Consent checkbox — the ESIGN "intent to sign" requirement */}
        <Checkbox
          isChecked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          colorScheme="yellow"
          alignItems="flex-start"
        >
          <Text fontSize="xs" color="gray.600" lineHeight="1.7" fontWeight="300">
            I agree to sign this contract electronically. I understand this
            signature has the same legal effect as a handwritten one under
            the U.S. ESIGN Act and the Uniform Electronic Transactions Act.
          </Text>
        </Checkbox>

        {error && (
          <Text fontSize="sm" color="red.500" fontWeight="400" textAlign="center">
            {error}
          </Text>
        )}

        <CTAButton
          onClick={handleSign}
          variant="solid"
          size="lg"
          fullWidth
          isLoading={submitting}
          loadingText="Signing..."
        >
          Sign Contract
        </CTAButton>
      </VStack>
    </Box>
  );
}

/**
 * Renders the contract body for in-portal reading. Mirrors the look of the
 * PDF (numbered sections, gold accents, bullets) but in HTML/Chakra so it
 * flows naturally on mobile. Skips the signature_block paragraph — the
 * sign form is the in-portal equivalent.
 */
function ContractBodyView({ contract }: { contract: ContractTemplate }) {
  return (
    <Box
      w="100%"
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      px={{ base: 5, md: 8 }}
      py={{ base: 7, md: 9 }}
    >
      <Text
        fontSize={{ base: 'md', md: 'lg' }}
        fontWeight="500"
        letterSpacing="0.05em"
        textAlign="center"
        color="gray.800"
        mb={6}
      >
        {contract.title}
      </Text>

      <VStack spacing={5} align="stretch">
        {contract.sections.map((section, idx) => {
          const isSignature = section.paragraphs.some(
            (p) => p.kind === 'signature_block',
          );
          if (isSignature) return null;
          return (
            <Box key={idx}>
              <Text
                fontSize="xs"
                fontWeight="600"
                letterSpacing="0.15em"
                textTransform="uppercase"
                color="#c9a96e"
                mb={2}
              >
                {section.number ? `${section.number}. ` : ''}
                {section.title}
              </Text>
              <VStack spacing={2.5} align="stretch">
                {section.paragraphs.map((p, i) => {
                  if (p.kind === 'text') {
                    return (
                      <Text
                        key={i}
                        fontSize="sm"
                        color="gray.700"
                        lineHeight="1.7"
                        fontWeight={p.emphasis === 'bold' ? '500' : '300'}
                        fontStyle={p.emphasis === 'italic' ? 'italic' : 'normal'}
                      >
                        {p.text}
                      </Text>
                    );
                  }
                  if (p.kind === 'bullets') {
                    return (
                      <VStack key={i} spacing={1.5} align="stretch" pl={4}>
                        {p.items.map((item, j) => (
                          <HStack key={j} align="flex-start" spacing={2.5}>
                            <Text color="#c9a96e" fontSize="sm" lineHeight="1.7">
                              •
                            </Text>
                            <Text
                              fontSize="sm"
                              color="gray.700"
                              lineHeight="1.7"
                              fontWeight="300"
                            >
                              {item}
                            </Text>
                          </HStack>
                        ))}
                      </VStack>
                    );
                  }
                  if (p.kind === 'fields') {
                    return (
                      <VStack key={i} spacing={1.5} align="stretch" pl={2}>
                        {p.items.map((f, j) => (
                          <Flex
                            key={j}
                            direction={{ base: 'column', md: 'row' }}
                            align={{ base: 'flex-start', md: 'baseline' }}
                            gap={{ base: 0.5, md: 2 }}
                          >
                            <Text
                              fontSize="sm"
                              color="gray.800"
                              fontWeight="500"
                              lineHeight="1.7"
                              minW={{ md: '170px' }}
                            >
                              {f.label}:
                            </Text>
                            <Text
                              fontSize="sm"
                              color="gray.700"
                              fontWeight="300"
                              lineHeight="1.7"
                              flex="1"
                            >
                              {f.value}
                            </Text>
                          </Flex>
                        ))}
                      </VStack>
                    );
                  }
                  return null;
                })}
              </VStack>
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
}

export default ClientPortalView;
