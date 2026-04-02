import { Box, Text } from '@chakra-ui/react';
import { CheckIcon } from '@chakra-ui/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useCallback, useRef } from 'react';

const MotionBox = motion(Box);

export function useCopyNotification() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), 2000);
  }, []);

  const Notification = () => (
    <AnimatePresence>
      {visible && (
        <MotionBox
          position="fixed"
          bottom={8}
          left="50%"
          zIndex={9999}
          initial={{ opacity: 0, y: 20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 10, x: '-50%' }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          display="flex"
          alignItems="center"
          gap={3}
          bg="white"
          border="1px solid"
          borderColor="gray.200"
          borderRadius="full"
          px={6}
          py={3}
          boxShadow="0 4px 20px rgba(0,0,0,0.08)"
        >
          <Box
            w="20px"
            h="20px"
            borderRadius="full"
            bg="#c9a96e"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <CheckIcon boxSize={2.5} color="white" />
          </Box>
          <Text
            fontSize="xs"
            fontWeight="400"
            letterSpacing="0.15em"
            textTransform="uppercase"
            color="gray.600"
          >
            Link Copied
          </Text>
        </MotionBox>
      )}
    </AnimatePresence>
  );

  return { show, Notification };
}
