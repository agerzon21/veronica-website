import { Box, Text, Flex, VStack } from '@chakra-ui/react';
import Reveal from './ui/Reveal';

const StatsSection = () => {
  return (
    <Box bg="white" layerStyle="section" px={6}>
      {/* amount 'some' is what `viewport={{ once: true }}` already meant:
          framer defaults the viewport amount to 'some', so the trigger point
          is unchanged. */}
      <Reveal amount="some" from={{ opacity: 0, y: 20 }} duration={0.8}>
        <VStack spacing={6} mb={{ base: 10, md: 14 }}>
          <Text textStyle="eyebrow">Veronika Gerzon</Text>
          {/* 40px, not 35 — the one rule width PageHeader uses everywhere. */}
          <Box w="40px" h="1px" bg="brand.accent" />
          <Text textStyle="bodyLead">Wedding & Portrait Photographer</Text>
        </VStack>

        <Flex
          justify="center"
          gap={{ base: 10, md: 16 }}
          direction="row"
          align="center"
        >
          {[
            { label: 'Based in', value: 'Scranton, PA' },
            { label: 'Experience', value: '12+ Years' },
            { label: 'Available', value: 'Worldwide' },
          ].map((stat) => (
            <VStack key={stat.label} spacing={1.5}>
              <Text textStyle="metaCaption">{stat.label}</Text>
              <Text textStyle="cardTitle">{stat.value}</Text>
            </VStack>
          ))}
        </Flex>
      </Reveal>
    </Box>
  );
};

export default StatsSection;
