/**
 * "Book another session", from inside the client portal (2026-10-22).
 *
 * A signed-in client asks Veronika for another shoot without a new email or
 * password: it reaches her as a lead and a message in Messages, on the
 * client's own thread (api/portal/_book-session.ts), and she adds the session
 * to this same account from the admin.
 *
 * Built on the shared ConfirmDialog, so it looks and behaves like every other
 * dialog in the portal, with the portal's own input styling inside.
 */

import { Input, Select, Text, Textarea, VStack, useToast } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import ConfirmDialog from './ui/ConfirmDialog';

const KINDS = ['Engagement', 'Wedding', 'Portrait', 'Family', 'Maternity', 'Proposal', 'Something else'];

const fieldFocus = { borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' };

const Label = ({ htmlFor, children }: { htmlFor: string; children: string }) => (
  <Text as="label" htmlFor={htmlFor} display="block" fontSize="2xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="brand.accentText" mb={1.5}>
    {children}
  </Text>
);

export default function BookSessionModal({
  isOpen,
  onClose,
  credentials,
}: {
  isOpen: boolean;
  onClose: () => void;
  credentials: { email: string; password: string; portalId?: string };
}) {
  const toast = useToast();
  const [kind, setKind] = useState(KINDS[0]);
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // A fresh form each time it opens.
  useEffect(() => {
    if (isOpen) {
      setKind(KINDS[0]);
      setWhen('');
      setNote('');
      setError('');
    }
  }, [isOpen]);

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/portal/book-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, kind, when: when.trim(), note: note.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        onClose();
        toast({
          title: 'Sent to Veronika',
          description: "She'll reply by email. The new session will appear right here in your portal.",
          status: 'success',
          duration: 7000,
          isClosable: true,
        });
      } else {
        setError(data.error || 'That did not go through. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      title="Book another session"
      confirmLabel="Send to Veronika"
      cancelLabel="Cancel"
      isLoading={sending}
      onConfirm={send}
      onCancel={onClose}
      body={
        <VStack align="stretch" spacing={4} pt={1} data-testid="book-session-form">
          <Text fontSize="sm" color="gray.600">
            Tell Veronika what you have in mind and she will get back to you. Same login, no new account.
          </Text>
          <div>
            <Label htmlFor="book-kind">What kind of session?</Label>
            <Select id="book-kind" value={kind} onChange={(e) => setKind(e.target.value)} h="40px" bg="white" fontSize="sm" _focus={fieldFocus}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="book-when">Roughly when?</Label>
            <Input id="book-when" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="A date, or something like “next spring”" h="40px" bg="white" fontSize="sm" _focus={fieldFocus} />
          </div>
          <div>
            <Label htmlFor="book-note">Anything else?</Label>
            <Textarea id="book-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where, who, what you'd love to capture" rows={3} bg="white" fontSize="sm" _focus={fieldFocus} />
          </div>
          {error && (
            <Text fontSize="sm" color="red.600" role="alert">
              {error}
            </Text>
          )}
        </VStack>
      }
    />
  );
}
