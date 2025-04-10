import React, { useState } from 'react';
import { Box, Heading, Text, Container, VStack, FormControl, FormLabel, Input, Textarea, Button, useToast } from '@chakra-ui/react';

const Contact: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const toast = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here you would typically send the form data to your backend
    console.log('Form submitted:', formData);
    toast({
      title: 'Message Sent',
      description: 'Thank you for your message. We will get back to you soon!',
      status: 'success',
      duration: 5000,
      isClosable: true,
    });
  };

  return (
    <Container maxW="1200px" py={32}>
      <VStack spacing={8} align="stretch" mb={16}>
        <Heading 
          as="h1" 
          size="2xl" 
          textAlign="center"
          fontWeight="light"
          letterSpacing="tight"
        >
          Contact
        </Heading>
        <Text 
          fontSize="xl" 
          textAlign="center" 
          color="gray.600"
        >
          Get in touch to discuss your photography needs
        </Text>
      </VStack>

      <Box 
        bg="white" 
        p={8} 
        borderRadius="xl" 
        boxShadow="xl"
        maxW="600px"
        mx="auto"
      >
        <form onSubmit={handleSubmit}>
          <VStack spacing={6}>
            <FormControl isRequired>
              <FormLabel>Name</FormLabel>
              <Input
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Your name"
                size="lg"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Email</FormLabel>
              <Input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Your email"
                size="lg"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Message</FormLabel>
              <Textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                placeholder="Your message"
                size="lg"
                rows={6}
              />
            </FormControl>
            <Button
              type="submit"
              colorScheme="blue"
              size="lg"
              width="full"
              mt={4}
            >
              Send Message
            </Button>
          </VStack>
        </form>
      </Box>
    </Container>
  );
};

export default Contact; 