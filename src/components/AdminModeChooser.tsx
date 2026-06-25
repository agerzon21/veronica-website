import { Box, VStack, Text, SimpleGrid, Icon, Flex } from '@chakra-ui/react';
import { FaFileSignature, FaImages, FaArrowLeft } from 'react-icons/fa';

interface Props {
  onPick: (mode: 'full' | 'gallery') => void;
  onCancel: () => void;
}

const AdminModeChooser = ({ onPick, onCancel }: Props) => {
  return (
    <Box maxW="900px" mx="auto">
      <Flex align="center" mb={8} gap={3}>
        <Box
          as="button"
          type="button"
          onClick={onCancel}
          display="inline-flex"
          alignItems="center"
          gap={2}
          fontSize="xs"
          letterSpacing="0.2em"
          textTransform="uppercase"
          color="gray.500"
          _hover={{ color: '#c9a96e' }}
          cursor="pointer"
          bg="transparent"
          border="none"
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Icon as={FaArrowLeft} boxSize={3} />
          Back
        </Box>
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
      _hover={{ borderColor: '#c9a96e', transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
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
