import { Box } from '@chakra-ui/react';
import { motion } from 'framer-motion';

const MotionBox = motion(Box);

interface BurgerMenuProps {
  isOpen: boolean;
  onClick: () => void;
}

const BurgerMenu = ({ isOpen, onClick }: BurgerMenuProps) => {
  const transition = {
    duration: 0.3,
    ease: [0.4, 0, 0.2, 1]
  };

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
          w="24px"
          h="2px"
          bg={isOpen ? "white" : "gray.800"}
          initial={false}
          animate={{
            top: isOpen ? "50%" : "0%",
            transform: isOpen ? "translateY(-50%) rotate(45deg)" : "none",
          }}
          transition={transition}
          transformOrigin="center"
        />
        <MotionBox
          position="absolute"
          w="24px"
          h="2px"
          bg={isOpen ? "white" : "gray.800"}
          top="50%"
          initial={false}
          animate={{
            opacity: isOpen ? 0 : 1,
            transform: isOpen ? "translateY(-50%) scaleX(0)" : "translateY(-50%)",
          }}
          transition={transition}
          transformOrigin="center"
        />
        <MotionBox
          position="absolute"
          w="24px"
          h="2px"
          bg={isOpen ? "white" : "gray.800"}
          initial={false}
          animate={{
            bottom: isOpen ? "50%" : "0%",
            transform: isOpen ? "translateY(50%) rotate(-45deg)" : "none",
          }}
          transition={transition}
          transformOrigin="center"
        />
      </Box>
    </Box>
  );
};

export default BurgerMenu; 