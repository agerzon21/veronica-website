import React, { useState } from 'react';
import { Box, FormControl, FormLabel, Input, Textarea, Button, useToast, VStack } from '@chakra-ui/react';
import PageHeader from '../components/PageHeader';
import PageContainer from '../components/PageContainer';

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
    <PageContainer>
      <PageHeader 
        title="Contact"
        subtitle="Get in touch to discuss your photography needs"
      />

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
              <FormLabel fontSize={{ base: "sm", md: "md" }}>Name</FormLabel>
              <Input
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Your name"
                size="lg"
                fontSize={{ base: "sm", md: "md" }}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize={{ base: "sm", md: "md" }}>Email</FormLabel>
              <Input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Your email"
                size="lg"
                fontSize={{ base: "sm", md: "md" }}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize={{ base: "sm", md: "md" }}>Message</FormLabel>
              <Textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                placeholder="Your message"
                size="lg"
                rows={6}
                fontSize={{ base: "sm", md: "md" }}
              />
            </FormControl>
            <Button
              type="submit"
              colorScheme="blue"
              size="lg"
              width="full"
              mt={4}
              fontSize={{ base: "sm", md: "md" }}
            >
              Send Message
            </Button>
          </VStack>
        </form>
      </Box>
    </PageContainer>
  );
};

export default Contact; 