import { Box, VStack, Text, SimpleGrid, Icon, Flex } from '@chakra-ui/react';
import FaFileSignature from '../icons/fa/FaFileSignature';
import FaImages from '../icons/fa/FaImages';
import AdminBackButton from './ui/AdminBackButton';
import { useAdminLang } from '../i18n/admin';

interface Props {
  onPick: (mode: 'full' | 'gallery') => void;
  onCancel: () => void;
}

const AdminModeChooser = ({ onPick, onCancel }: Props) => {
  const { t } = useAdminLang();
  return (
    <Box maxW="900px" mx="auto" px={{ base: 4, md: 6 }} py={{ base: 6, md: 8 }}>
      {/* Back sits WITH the heading, not alone above it.
          AdminBackButton paints nothing (transparent background and border),
          so a Flex whose only child is one meant a small grey chevron hanging
          in white space with 32px of nothing under it. These three screens
          also render no tab strip and no bottom bar, so that chevron was the
          only navigation on the whole page. Same band as the client screen. */}
      <Flex align="flex-start" gap={{ base: 2, md: 3 }} mb={8} pt={1}>
        {/* The button pulls itself 8px left to optically align its chevron;
            the band supplies the padding for that to cancel against. */}
        <Box pl={2} flexShrink={0}>
          <AdminBackButton onClick={onCancel} label={t.common.back} />
        </Box>
        <Box flex="1" minW={0}>
          <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="brand.accent">
            {t.modeChooser.kicker}
          </Text>
          <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0} mt={0.5}>
            {t.modeChooser.title}
          </Text>
        </Box>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Card
          icon={FaFileSignature}
          title={t.modeChooser.fullTitle}
          description={t.modeChooser.fullDescription}
          onClick={() => onPick('full')}
        />
        <Card
          icon={FaImages}
          title={t.modeChooser.galleryOnlyTitle}
          description={t.modeChooser.galleryOnlyDescription}
          onClick={() => onPick('gallery')}
        />
      </SimpleGrid>
    </Box>
  );
};

function Card({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="md"
      px={{ base: 5, md: 7 }}
      py={{ base: 6, md: 8 }}
      textAlign="left"
      cursor="pointer"
      transition="all 0.2s"
      // Touch devices trigger `:hover` on tap and get stuck in the lifted
      // state until the next tap elsewhere — gate the lift behind a real
      // hover-capable pointer, and pair it with an explicit press state.
      _active={{ borderColor: 'brand.accent', bg: 'rgba(201, 169, 110, 0.06)' }}
      sx={{
        WebkitTapHighlightColor: 'transparent',
        '@media (hover: hover)': {
          '&:hover': {
            borderColor: 'brand.accent',
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          },
        },
      }}
    >
      <VStack align="flex-start" spacing={3}>
        <Icon as={icon} boxSize={6} color="brand.accent" />
        <Text fontSize="lg" fontWeight="500" color="gray.800">
          {title}
        </Text>
        <Text fontSize="sm" color="gray.600" lineHeight="1.6" fontWeight="300">
          {description}
        </Text>
      </VStack>
    </Box>
  );
}

export default AdminModeChooser;
