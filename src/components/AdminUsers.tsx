import {
  Box, VStack, HStack, Text, Flex, Icon, Badge, useToast, Spinner, IconButton,
  Input, Select, FormControl, FormLabel, Collapse, Divider,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import {
  FaSyncAlt, FaUserPlus, FaKey, FaCopy, FaCheck, FaSignOutAlt, FaTrash,
} from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import ConfirmDialog from './ui/ConfirmDialog';
import AdminCard from './ui/AdminCard';
import { useAdminLang } from '../i18n/admin';

/**
 * "Admin users" super-admin panel — who can sign in, at what level, and the
 * one place to rotate your own password. Lives behind the Menu drawer next to
 * Crons and Integrations because it's operator-only.
 *
 * Backed by admin_users (migration 026), which replaced the old model where
 * both admin logins were Vercel env vars. That meant rotating a password was a
 * redeploy and adding a third person meant shipping code.
 *
 * ── Two things here are deliberately NOT symmetrical ──
 *
 * You can change YOUR OWN password but not anyone else's. Setting someone
 * else's password is silent account takeover; instead, creating an account
 * issues a one-time password shown once to whoever created it. Granting access
 * is therefore always a visible, deliberate act.
 *
 * Disable and delete both exist, but delete is not offered on every row. It is
 * hidden for the two accounts backed by Vercel env credentials: removing those
 * rows would RESTORE access rather than revoke it, because the env fallback
 * reads a missing row as "no opinion" and lets the password through. Disable
 * works for them precisely because the row survives with is_active = false.
 *
 * The screen renders for EVERY admin level, but shows different things. A
 * super sees the account list and the add-someone form; everyone sees their own
 * password and their own sessions. That split is not the security boundary —
 * the API enforces the real one — it just avoids rendering a list that would
 * come back 403.
 *
 * A non-super has to be able to get here, or someone issued a one-time password
 * would have no way to ever change it.
 */

interface Props {
  adminPassword: string;
  adminLevel: 'admin' | 'super';
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  level: 'admin' | 'super';
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  active_sessions: number;
  /** Tied to a Vercel env credential. Disable-only — see the API's delete branch. */
  env_backed?: boolean;
}

const MIN_PASSWORD_LENGTH = 8;

const AdminUsers = ({ adminPassword, adminLevel }: Props) => {
  const { t } = useAdminLang();
  const [items, setItems] = useState<UserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<UserRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);

  // Add-a-person form
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newLevel, setNewLevel] = useState<'admin' | 'super'>('admin');
  const [creating, setCreating] = useState(false);
  // Held in state only until dismissed. Never persisted, never re-fetchable.
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Own-password form
  const [ownOpen, setOwnOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changing, setChanging] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const toast = useToast();

  const call = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword, ...body }),
    });
    return { res, data: await res.json() };
  };

  const isSuper = adminLevel === 'super';

  const loadItems = async () => {
    // Only a super can list accounts; for anyone else this would 403, and the
    // self-service cards below do not depend on it.
    if (!isSuper) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await call({ op: 'list' });
      if (res.ok && data.success) {
        setItems(data.users);
        setMe(data.me ?? null);
      }
      else setError(data.error || t.users.loadFailed);
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPassword]);

  const setActive = async (row: UserRow, next: boolean) => {
    setBusyId(row.id);
    try {
      const { res, data } = await call({ op: 'set-active', user_id: row.id, is_active: next });
      if (res.ok && data.success) {
        setItems((cur) =>
          cur
            ? cur.map((r) =>
                // Disabling kills their sessions server-side, so reflect that
                // here too rather than showing a stale "signed in" count.
                r.id === row.id
                  ? { ...r, is_active: next, active_sessions: next ? r.active_sessions : 0 }
                  : r,
              )
            : cur,
        );
        toast({
          title: next ? t.users.enabledToast : t.users.disabledToast,
          status: 'success', duration: 3000, isClosable: true,
        });
      } else {
        toast({
          title: data.error || t.users.loadFailed,
          status: 'error', duration: 5000, isClosable: true,
        });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setBusyId(null);
      setConfirmDisable(null);
    }
  };

  const deleteUser = async (row: UserRow) => {
    setBusyId(row.id);
    try {
      const { res, data } = await call({ op: 'delete', user_id: row.id });
      if (res.ok && data.success) {
        setItems((cur) => (cur ? cur.filter((r) => r.id !== row.id) : cur));
        toast({ title: t.users.deletedToast, status: 'success', duration: 3000, isClosable: true });
      } else {
        toast({
          title: data.error || t.users.loadFailed,
          status: 'error', duration: 5000, isClosable: true,
        });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  };

  const createUser = async () => {
    setCreating(true);
    try {
      const { res, data } = await call({
        op: 'create', email: newEmail, display_name: newName, level: newLevel,
      });
      if (res.ok && data.success) {
        setTempPassword(data.temporary_password);
        setCopied(false);
        setAddOpen(false);
        setNewEmail(''); setNewName(''); setNewLevel('admin');
        void loadItems();
      } else {
        toast({
          title: data.error || t.users.addFailed,
          status: 'error', duration: 5000, isClosable: true,
        });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setCreating(false);
    }
  };

  const changeOwnPassword = async () => {
    setOwnError(null);
    if (newPw.length < MIN_PASSWORD_LENGTH) return setOwnError(t.users.tooShort);
    if (newPw !== confirmPw) return setOwnError(t.users.mismatch);

    setChanging(true);
    try {
      const { res, data } = await call({
        op: 'change-own', current_password: currentPw, new_password: newPw,
      });
      if (res.ok && data.success) {
        setOwnOpen(false);
        setCurrentPw(''); setNewPw(''); setConfirmPw('');
        toast({ title: t.users.ownDone, status: 'success', duration: 4000, isClosable: true });
        // Other devices were signed out; this one wasn't, so the session token
        // in the parent is still valid and nothing needs re-authenticating.
        void loadItems();
      } else {
        setOwnError(
          res.status === 401
            ? t.users.wrongCurrent
            : res.status === 409
              ? t.users.ownNoAccount
              : data.error || t.users.addFailed,
        );
      }
    } catch {
      setOwnError(t.common.couldNotReach);
    } finally {
      setChanging(false);
    }
  };

  const signOutOthers = async () => {
    setSigningOut(true);
    try {
      const { res, data } = await call({ op: 'signout-others' });
      if (res.ok && data.success) {
        toast({
          title: data.dropped > 0 ? t.users.othersDone(data.dropped) : t.users.othersNone,
          status: 'success', duration: 4000, isClosable: true,
        });
        void loadItems();
      } else {
        toast({
          // 409 here means an env-var login, which has no session row to end.
          title: res.status === 409 ? t.users.othersNoAccount : data.error || t.users.loadFailed,
          status: 'error', duration: 5000, isClosable: true,
        });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setSigningOut(false);
    }
  };

  const copyTemp = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (insecure context, permissions). The password
      // is on screen and selectable, so this is a convenience, not the path.
      toast({ title: t.users.tempCopy, status: 'info', duration: 2500, isClosable: true });
    }
  };

  const formatWhen = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  return (
    <Box maxW="1200px" mx="auto" px={{ base: 4, md: 8 }} py={{ base: 5, md: 8 }}>
      <Flex align="flex-end" justify="space-between" mb={{ base: 5, md: 8 }} gap={3}>
        <VStack align="flex-start" spacing={1} minW={0}>
          <Text
            fontSize="xs" fontWeight="500" textTransform="uppercase"
            letterSpacing="0.25em" color="brand.accent"
          >
            {t.common.adminKicker}
          </Text>
          <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
            {isSuper ? t.users.tabTitle : t.users.selfTabTitle}
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            {!isSuper
              ? t.users.selfSubtitle
              : items
                ? t.users.userCount(items.length)
                : t.users.subtitle}
          </Text>
        </VStack>

        <HStack spacing={2} flexShrink={0} display={isSuper ? undefined : 'none'}>
          <IconButton
            aria-label={t.users.refreshAria}
            icon={<Icon as={FaSyncAlt} boxSize={4} />}
            onClick={loadItems}
            variant="ghost" size="md" minW="44px" minH="44px"
            color="gray.500"
            _hover={{ color: 'brand.accent' }}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          />
        </HStack>
      </Flex>

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      {/* One-time password. Shown once, dismissed by hand — deliberately not a
          toast, which would time out and take the only copy with it. */}
      {tempPassword && (
        <AdminCard emphasize mb={4}>
          <Text fontSize="sm" fontWeight="500" color="gray.800" mb={1}>
            {t.users.tempTitle}
          </Text>
          <Text fontSize="sm" color="gray.600" fontWeight="300" mb={3}>
            {t.users.tempBody}
          </Text>
          <HStack spacing={3} align="center" flexWrap="wrap">
            <Box
              bg="brand.surfaceSunken" border="1px solid" borderColor="brand.accentBorder"
              px={3} py={2} borderRadius="sm" fontFamily="mono" fontSize="md"
              userSelect="all" color="gray.800"
            >
              {tempPassword}
            </Box>
            <CTAButton
              variant="ghost" size="sm"
              icon={copied ? FaCheck : FaCopy}
              onClick={copyTemp}
            >
              {copied ? t.users.tempCopied : t.users.tempCopy}
            </CTAButton>
            <CTAButton variant="outline" size="sm" onClick={() => setTempPassword(null)}>
              {t.users.tempDone}
            </CTAButton>
          </HStack>
        </AdminCard>
      )}

      {loading && (
        <Flex justify="center" py={12}><Spinner color="brand.accent" /></Flex>
      )}

      <VStack align="stretch" spacing={3}>
        {/* Account list + add form: super only. Everything after is
            self-service and renders for every level. */}
        {isSuper && !loading && items?.map((u) => (
          <AdminCard key={u.id}>
            <Flex
              justify="space-between" align={{ base: 'flex-start', md: 'center' }}
              gap={3} direction={{ base: 'column', md: 'row' }}
            >
              <VStack align="flex-start" spacing={1} minW={0}>
                <HStack spacing={2} flexWrap="wrap">
                  <Text fontSize="sm" fontWeight="500" color="gray.800">
                    {u.display_name || u.email}
                  </Text>
                  <Badge
                    fontSize="0.65rem" textTransform="none" fontWeight="500"
                    colorScheme={u.level === 'super' ? 'purple' : 'gray'}
                  >
                    {u.level === 'super' ? t.users.levelSuper : t.users.levelAdmin}
                  </Badge>
                  {u.id === me && (
                    <Badge
                      fontSize="0.65rem" textTransform="none" fontWeight="500"
                      bg="brand.accentSoft" color="brand.accentText"
                    >
                      {t.users.you}
                    </Badge>
                  )}
                  {!u.is_active && (
                    <Badge fontSize="0.65rem" textTransform="none" fontWeight="500" colorScheme="red">
                      {t.users.disabled}
                    </Badge>
                  )}
                </HStack>

                {u.display_name && (
                  <Text fontSize="xs" color="gray.500" fontWeight="300">{u.email}</Text>
                )}

                {u.env_backed && (
                  <Text fontSize="xs" color="gray.400" fontWeight="300">
                    {t.users.envBackedHint}
                  </Text>
                )}

                <Text fontSize="xs" color="gray.500" fontWeight="300">
                  {u.is_active && u.active_sessions > 0
                    ? t.users.signedInNow(u.active_sessions)
                    : u.last_login_at
                      ? t.users.lastSignIn(formatWhen(u.last_login_at) ?? '')
                      : t.users.neverSignedIn}
                </Text>
              </VStack>

              {u.id !== me && (
                <HStack spacing={2} flexShrink={0}>
                  <CTAButton
                    variant={u.is_active ? 'danger' : 'outline'}
                    size="sm"
                    isLoading={busyId === u.id}
                    onClick={() => (u.is_active ? setConfirmDisable(u) : void setActive(u, true))}
                  >
                    {u.is_active ? t.users.disableAction : t.users.enableAction}
                  </CTAButton>
                  {/* Deliberately absent for env-backed rows rather than
                      present-and-rejected: offering an action that can only
                      fail is worse than not offering it. */}
                  {!u.env_backed && (
                    <CTAButton
                      variant="ghost"
                      size="sm"
                      icon={FaTrash}
                      isDisabled={busyId === u.id}
                      onClick={() => setConfirmDelete(u)}
                    >
                      {t.users.deleteAction}
                    </CTAButton>
                  )}
                </HStack>
              )}
            </Flex>
          </AdminCard>
        ))}

        {/* ─── Add someone ─────────────────────────────────── */}
        {isSuper && !loading && (
          <AdminCard>
            <Flex justify="space-between" align="center" gap={3}>
              <VStack align="flex-start" spacing={0} minW={0}>
                <Text fontSize="sm" fontWeight="500" color="gray.800">{t.users.addTitle}</Text>
                <Text fontSize="xs" color="gray.500" fontWeight="300">
                  {t.users.levelAdminHint}
                </Text>
              </VStack>
              {!addOpen && (
                <CTAButton variant="outline" size="sm" icon={FaUserPlus} onClick={() => setAddOpen(true)}>
                  {t.users.addOpen}
                </CTAButton>
              )}
            </Flex>

            <Collapse in={addOpen} animateOpacity>
              <Divider my={4} borderColor="brand.accentBorder" />
              <VStack align="stretch" spacing={3}>
                <FormControl>
                  <FormLabel fontSize="xs" color="gray.600" fontWeight="400" mb={1}>
                    {t.users.emailLabel}
                  </FormLabel>
                  <Input
                    type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                    size="sm" borderRadius="sm" bg="brand.surfaceSunken"
                    autoComplete="off"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="xs" color="gray.600" fontWeight="400" mb={1}>
                    {t.users.nameLabel}{' '}
                    <Text as="span" color="gray.400">({t.users.nameOptional})</Text>
                  </FormLabel>
                  <Input
                    value={newName} onChange={(e) => setNewName(e.target.value)}
                    size="sm" borderRadius="sm" bg="brand.surfaceSunken"
                    autoComplete="off"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="xs" color="gray.600" fontWeight="400" mb={1}>
                    {t.users.levelLabel}
                  </FormLabel>
                  <Select
                    value={newLevel}
                    onChange={(e) => setNewLevel(e.target.value === 'super' ? 'super' : 'admin')}
                    size="sm" borderRadius="sm" bg="brand.surfaceSunken"
                  >
                    <option value="admin">{t.users.levelAdmin}</option>
                    <option value="super">{t.users.levelSuper}</option>
                  </Select>
                  <Text fontSize="xs" color="gray.500" fontWeight="300" mt={1}>
                    {newLevel === 'super' ? t.users.levelSuperHint : t.users.levelAdminHint}
                  </Text>
                </FormControl>

                <HStack spacing={2} justify="flex-end" pt={1}>
                  <CTAButton variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
                    {t.users.cancel}
                  </CTAButton>
                  <CTAButton
                    variant="solid" size="sm"
                    isLoading={creating}
                    isDisabled={!newEmail.trim()}
                    onClick={createUser}
                  >
                    {t.users.addSubmit}
                  </CTAButton>
                </HStack>
              </VStack>
            </Collapse>
          </AdminCard>
        )}

        {/* ─── Other devices ───────────────────────────────── */}
        {/* The milder version of a password change: end other sessions,
            keep the password. */}
        <AdminCard>
          <Flex justify="space-between" align="center" gap={3}>
            <VStack align="flex-start" spacing={0} minW={0}>
              <Text fontSize="sm" fontWeight="500" color="gray.800">{t.users.othersTitle}</Text>
              <Text fontSize="xs" color="gray.500" fontWeight="300">{t.users.othersBody}</Text>
            </VStack>
            <Box flexShrink={0}>
              <CTAButton
                variant="outline" size="sm" icon={FaSignOutAlt}
                isLoading={signingOut}
                onClick={signOutOthers}
              >
                {t.users.othersAction}
              </CTAButton>
            </Box>
          </Flex>
        </AdminCard>

        {/* ─── Your own password ───────────────────────────── */}
        <AdminCard>
          <Flex justify="space-between" align="center" gap={3}>
            <VStack align="flex-start" spacing={0} minW={0}>
              <Text fontSize="sm" fontWeight="500" color="gray.800">{t.users.ownTitle}</Text>
              <Text fontSize="xs" color="gray.500" fontWeight="300">{t.users.ownBody}</Text>
            </VStack>
            {!ownOpen && (
              <CTAButton variant="outline" size="sm" icon={FaKey} onClick={() => setOwnOpen(true)}>
                {t.users.ownOpen}
              </CTAButton>
            )}
          </Flex>

          <Collapse in={ownOpen} animateOpacity>
            <Divider my={4} borderColor="brand.accentBorder" />
            <VStack align="stretch" spacing={3}>
              <FormControl>
                <FormLabel fontSize="xs" color="gray.600" fontWeight="400" mb={1}>
                  {t.users.currentLabel}
                </FormLabel>
                <Input
                  type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
                  size="sm" borderRadius="sm" bg="brand.surfaceSunken"
                  autoComplete="current-password"
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" color="gray.600" fontWeight="400" mb={1}>
                  {t.users.newLabel}
                </FormLabel>
                <Input
                  type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                  size="sm" borderRadius="sm" bg="brand.surfaceSunken"
                  autoComplete="new-password"
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" color="gray.600" fontWeight="400" mb={1}>
                  {t.users.confirmLabel}
                </FormLabel>
                <Input
                  type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                  size="sm" borderRadius="sm" bg="brand.surfaceSunken"
                  autoComplete="new-password"
                />
              </FormControl>

              {ownError && <Text fontSize="xs" color="red.600">{ownError}</Text>}

              <HStack spacing={2} justify="flex-end" pt={1}>
                <CTAButton
                  variant="ghost" size="sm"
                  onClick={() => {
                    setOwnOpen(false); setOwnError(null);
                    setCurrentPw(''); setNewPw(''); setConfirmPw('');
                  }}
                >
                  {t.users.cancel}
                </CTAButton>
                <CTAButton
                  variant="solid" size="sm"
                  isLoading={changing}
                  isDisabled={!currentPw || !newPw || !confirmPw}
                  onClick={changeOwnPassword}
                >
                  {t.users.ownSubmit}
                </CTAButton>
              </HStack>
            </VStack>
          </Collapse>
        </AdminCard>
      </VStack>

      {!loading && (
        <Box mt={6} px={{ base: 1, md: 2 }}>
          <Text fontSize="xs" fontWeight="500" color="gray.600" mb={1}>
            {t.users.recoveryTitle}
          </Text>
          <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.7">
            {/* The environment variables back exactly two accounts, and they
                are Alex's to manage. Anyone else gets the answer that actually
                applies to them. */}
            {isSuper ? t.users.recoveryBody : t.users.recoveryOther}
          </Text>
        </Box>
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title={t.users.deleteTitle}
        body={confirmDelete ? t.users.deleteBody(confirmDelete.email) : undefined}
        confirmLabel={t.users.deleteConfirm}
        cancelLabel={t.users.cancel}
        danger
        isLoading={!!busyId}
        onConfirm={() => confirmDelete && void deleteUser(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        isOpen={!!confirmDisable}
        title={t.users.disableTitle}
        body={confirmDisable ? t.users.disableBody(confirmDisable.email) : undefined}
        confirmLabel={t.users.disableConfirm}
        cancelLabel={t.users.cancel}
        danger
        isLoading={!!busyId}
        onConfirm={() => confirmDisable && void setActive(confirmDisable, false)}
        onCancel={() => setConfirmDisable(null)}
      />
    </Box>
  );
};

export default AdminUsers;
