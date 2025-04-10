import { Box } from '@chakra-ui/react';
import { motion } from 'framer-motion';

const MotionBox = motion(Box);

interface BurgerMenuProps {
  isOpen: boolean;
  onClick: () => void;
}

const BurgerMenu = ({ isOpen, onClick }: BurgerMenuProps) => {
  return (
    <Box
      display={{ base: 'block', md: 'none' }}
      onClick={onClick}
      cursor="pointer"
      zIndex={2000}
      p={2}
      position="relative"
    >
      <Box position="relative" w="24px" h="20px">
        <MotionBox
          position="absolute"
          top="0"
          left="0"
          right="0"
          h="2px"
          bg={isOpen ? "white" : "gray.800"}
          transformOrigin="center"
          animate={{
            top: isOpen ? '9px' : '0',
            transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
          }}
          transition={{
            duration: 0.3,
            top: { type: "spring", stiffness: 100 }
          }}
        />
        <MotionBox
          position="absolute"
          top="9px"
          left="0"
          right="0"
          h="2px"
          bg={isOpen ? "white" : "gray.800"}
          transformOrigin="center"
          animate={{
            opacity: isOpen ? 0 : 1,
            transform: isOpen ? 'scaleX(0)' : 'scaleX(1)',
          }}
          transition={{ duration: 0.2 }}
        />
        <MotionBox
          position="absolute"
          bottom="0"
          left="0"
          right="0"
          h="2px"
          bg={isOpen ? "white" : "gray.800"}
          transformOrigin="center"
          animate={{
            bottom: isOpen ? '9px' : '0',
            transform: isOpen ? 'rotate(-45deg)' : 'rotate(0deg)',
          }}
          transition={{
            duration: 0.3,
            bottom: { type: "spring", stiffness: 100 }
          }}
        />
      </Box>
    </Box>
  );
};

export default BurgerMenu; 