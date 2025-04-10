import { Container, ContainerProps } from '@chakra-ui/react';
import { ReactNode } from 'react';

interface PageContainerProps extends ContainerProps {
  children: ReactNode;
}

const PageContainer = ({ children, ...props }: PageContainerProps) => {
  return (
    <Container
      maxW="container.xl"
      py={{ base: 16, md: 32 }}
      px={{ base: 4, md: 8 }}
      {...props}
    >
      {children}
    </Container>
  );
};

export default PageContainer; 