import { VStack, Heading, Text } from '@chakra-ui/react';

interface PageHeaderProps {
  title: string;
  subtitle: string;
}

const PageHeader = ({ title, subtitle }: PageHeaderProps) => {
  return (
    <VStack spacing={8} align="stretch" mb={16}>
      <VStack spacing={6}>
        <Heading 
          as="h1" 
          size="2xl" 
          textAlign="center"
          fontWeight="light"
          letterSpacing="tight"
        >
          {title}
        </Heading>
        <Text 
          fontSize="xl" 
          textAlign="center" 
          color="gray.600"
        >
          {subtitle}
        </Text>
      </VStack>
    </VStack>
  );
};

export default PageHeader; 