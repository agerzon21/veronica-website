import { VStack, Heading, Text, Box } from '@chakra-ui/react';

interface PageHeaderProps {
  title: string;
  subtitle: string;
}

const PageHeader = ({ title, subtitle }: PageHeaderProps) => {
  return (
    <VStack 
      spacing={{ base: 4, md: 8 }} 
      align="stretch" 
      mb={{ base: 8, md: 16 }}
      px={{ base: 4, md: 0 }}
    >
      <VStack spacing={{ base: 3, md: 6 }}>
        <Heading 
          as="h1" 
          size={{ base: "xl", md: "2xl" }}
          textAlign="center"
          fontWeight="light"
          letterSpacing="tight"
          lineHeight="1.2"
        >
          {title}
        </Heading>
        <Text 
          fontSize={{ base: "lg", md: "xl" }}
          textAlign="center" 
          color="gray.600"
          maxW="container.md"
          mx="auto"
        >
          {subtitle}
        </Text>
      </VStack>
    </VStack>
  );
};

export default PageHeader; 