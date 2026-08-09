import { Box, VStack, Text, SimpleGrid, Icon, Flex } from '@chakra-ui/react';
import { FaFileSignature, FaImages } from 'react-icons/fa';
import AdminBackButton from './ui/AdminBackButton';

interface Props {
  onPick: (mode: 'full' | 'gallery') => void;
  onCancel: () => void;
}

const AdminModeChooser = ({ onPick, onCancel }: Props) => {
  return (
    <Box maxW="900px" mx="auto" px={{ base: 4, md: 6 }} py={{ base: 6, md: 8 }}>
      <Flex align="center" mb={8} gap={3}>
        {/* Standard 44×44 back affordance — replaces the old hand-rolled
            chevron-with-Back-text link that had a ~20px tap target. */}
        <AdminBackButton onClick={onCancel} label="Back" />
      </Flex>

      <VStack align="flex-start" spacing={1} mb={8}>
        <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="#c9a96e">
          New Client
        </Text>
        <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
          What kind of booking?
        </Text>
      </VStack>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Card
          icon={FaFileSignature}
          title="Full Portal"
          description="A new booking with a contract to sign, payment tracking, onboarding email, and photo delivery later. Use this for weddings and most paid shoots."
          onClick={() => onPick('full')}
        />
        <Card
          icon={FaImages}
          title="Gallery Only"
          description="Just share a Google Drive gallery with a password. No contract, no email, no login — replaces the manual photo handoffs. Use this after a shoot when there's no portal flow."
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
      _active={{ borderColor: '#c9a96e', bg: 'rgba(201, 169, 110, 0.06)' }}
      sx={{
        WebkitTapHighlightColor: 'transparent',
        '@media (hover: hover)': {
          '&:hover': {
            borderColor: '#c9a96e',
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          },
        },
      }}
    >
      <VStack align="flex-start" spacing={3}>
        <Icon as={icon} boxSize={6} color="#c9a96e" />
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
