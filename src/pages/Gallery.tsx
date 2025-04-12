import { Box, Container, Text, IconButton, Flex } from '@chakra-ui/react';
import { useParams, Link } from 'react-router-dom';
import { ArrowBackIcon } from '@chakra-ui/icons';
import GalleryCategories from '../components/GalleryCategories';
import GalleryGrid from '../components/GalleryGrid';

// Sample images data structure
const sampleImages = {
  portraits: [
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744420852/_C6C7147_zexgnh.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418498/_C6C33921_nj0vzv.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418481/_C6C7842_ar2new.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418469/_C6C2698_le8ea3.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418398/_C6C0250_kgvym7.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418111/_C6C0622_nowzuo.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418108/_C6C0550_jjaeuc.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744417774/_C6C0375_npexhn.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744417695/_C6C0663_kbabsi.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744417686/_C6C5894_i0gtia.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744417403/2000jpg_ewkcnf.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744416813/QC6C8127_xfctsx.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744416772/QC6C3092_mp9qli.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744416477/IMG_4656_xasnim.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744414012/IMG_5689_2_fl8csc.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744413559/IMG_3896_zl0u6l.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744413549/154A0186_2_cwv1ub.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744413421/_C6C4873_ssggj0.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744400636/_C6C4393_dq8vhn.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744400015/%D0%B0%D0%B2%D0%BF_cl6hdn.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744399893/_C6C1095_lqimij.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744399881/_C6C1737_ilmxhh.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744399881/_C6C1344_owaca5.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744398816/2500_ixvxpa.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744398816/_C6C33182000_rhcf4y.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744398813/_C6C34192500_jb931s.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744398368/IMG_6921_kccbyg.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744397813/IMG_6920_vhaobr.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744397034/_C6C4709_copy_tzkqaa.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744397032/_C6C6868_copy_amaout.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744397027/_C6C4032_fyviyu.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744395095/IMG_6118_x9khmv.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744394809/_C6C5384_copy_zapuhx.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744394695/765456_mqaert.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744394626/IMG_5100_2_r4kcmr.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744394600/IMG_9840_xdmiic.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744394543/IMG_77601_copy_qystxt.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744394380/09988_wcuogo.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744394107/IMG_4768_copy_a1b13h.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744393947/IMG_5509_copy_ouxnki.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744393565/QC6C6905_copy_cgvysy.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744393406/IMG_0289_copy_b5lodk.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744392680/QC6C6660_%D0%BA%D0%BE%D0%BF%D0%B8%D1%8F_zqhxlw.jpg' }
  ],
  weddings: [
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744419019/QC6C4557_xa2iye.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744419010/QC6C4533_aoi0g7.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744416258/_C6C4729_hp5p5p.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744416025/_C6C7549_p44ynu.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744416012/_C6C4657_xnvdyo.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415936/_C6C0557_qlhoqc.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415882/_C6C23721_jhyzol.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415875/_C6C22691_xnm9za.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415849/IMG_1032_rjcgsa.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415550/IMG_1094_quo7wq.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415402/IMG_1101_qdv55f.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415271/DSC03274_mtuzs8.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415150/IMG_8996_copy_y63gjs.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415125/IMG_9193_pv8xq4.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415094/43276CB5-0809-4348-9484-F627D8CC7B13_jkvkda.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415084/34567_eozg8w.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415075/45678_moqymz.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415069/607CB7D4-0C7F-409F-A06D-233109EEE45F_pv1eds.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415067/41F5FD94-3D27-43A1-B47C-89B43F58C664_tdc8hl.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415004/05_rfvs8y.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744414955/01_r3bxzy.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744414711/_C6C9949_xbdpyi.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744414710/_C6C7794_po9wdj.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744414710/_C6C7681_wp8bbb.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744414705/_C6C9949_musgap.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744414690/_C6C0557_snztep.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744414665/_C6C65087_ewhiln.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744414580/_C6C0601_yhjlbf.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744414134/_C6C0529_wrdewc.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744414096/_C6C0084_vcgdtb.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744400099/QC6C4544_jprmgj.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744400076/QC6C4542_haryyr.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744400067/E0AB1A0C-3430-4A0B-ABD5-857612F6197E_aep7s6.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744400026/BDF7C74A-CC72-4501-A46E-0AE2F0D4F5C9_ive4mf.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744399932/_C6C3926_caafmp.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744399932/_C6C3980_zzzpzo.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744398610/IMG_6916_2_mga9r9.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744397278/IMG_9132_r8nabt.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744397228/_DSC4218_ugnjse.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744397111/_DSC4069_wi5mfe.jpg' }
  ],
  family: [
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3710_utj2oy.jpg' }
  ],
  maternity: [
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310086/IMG_3709_w1cvak.jpg' }
  ],
};

const categoryDetails = {
  portraits: {
    title: 'Portraits',
    description: 'Capturing the essence of individuals through stunning portrait photography.',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418398/_C6C0250_kgvym7.jpg'
  },
  weddings: {
    title: 'Weddings',
    description: 'Documenting your special day with beautiful and timeless wedding photography.',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415004/05_rfvs8y.jpg'
  },
  family: {
    title: 'Family',
    description: 'Preserving precious family moments with heartfelt photography sessions.',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744318392/IMG_3712_uvjtxr.jpg'
  },
  maternity: {
    title: 'Maternity',
    description: 'Celebrating the beauty of pregnancy with elegant maternity photography.',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744318392/IMG_3712_uvjtxr.jpg'
  }
};

const Gallery = () => {
  const { category } = useParams();
  
  console.log('Current category:', category);
  console.log('Available categories:', Object.keys(sampleImages));
  
  if (!category) {
    return (
      <Box position="relative" minH="100vh">
        {/* Background wrapper */}
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          height="60vh"
          zIndex={0}
          overflow="hidden"
        >
          {/* Background Image */}
          <Box
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            backgroundImage={`url(https://res.cloudinary.com/doj1fanx3/image/upload/v1744399893/_C6C1095_lqimij.jpg)`}
            backgroundSize="cover"
            backgroundPosition="center 15%"
            backgroundRepeat="no-repeat"
            _before={{
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bg: 'blackAlpha.600',
            }}
          />

          {/* Hero Content */}
          <Box
            position="relative"
            height="100%"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            zIndex={1}
          >
            <Text
              fontSize={{ base: '4xl', md: '6xl', lg: '7xl' }}
              fontWeight="light"
              color="white"
              textTransform="uppercase"
              letterSpacing="wider"
              textShadow="2px 2px 4px rgba(0,0,0,0.3)"
              mb={4}
            >
              Gallery
            </Text>
            <Text
              fontSize={{ base: 'xl', md: '2xl' }}
              color="white"
              fontStyle="italic"
              textShadow="1px 1px 2px rgba(0,0,0,0.3)"
            >
              A collection of my recent work
            </Text>
          </Box>
        </Box>

        {/* Content Section */}
        <Box 
          position="relative" 
          bg="white"
          marginTop="45vh"
          borderTopRadius="3xl"
          zIndex={2}
          boxShadow="0px -10px 30px rgba(0,0,0,0.2)"
          minH="100vh"
          pb={20}
        >
          <Container maxW="container.xl" py={16}>
            <GalleryCategories />
          </Container>
        </Box>
      </Box>
    );
  }

  const images = sampleImages[category as keyof typeof sampleImages] || [];
  const categoryInfo = categoryDetails[category as keyof typeof categoryDetails];
  
  // Randomize the order of images
  const randomizedImages = [...images].sort(() => Math.random() - 0.5);

  console.log('Selected category images:', images);
  console.log('Category info:', categoryInfo);

  return (
    <Box position="relative" minH="100vh">
      {/* Category Hero Section */}
      <Box
        position="relative"
        height="50vh"
        width="100%"
        overflow="hidden"
      >
        {/* Background Image */}
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundImage={`url(${categoryInfo.image})`}
          backgroundSize="cover"
          backgroundPosition="center 10%"
          backgroundRepeat="no-repeat"
          filter="brightness(0.5)"
        />

        {/* Category Title */}
        <Flex
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          height="100%"
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          bg="linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)"
        >
          <Text
            fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }}
            fontWeight="light"
            color="white"
            textTransform="uppercase"
            letterSpacing="wider"
            textShadow="2px 2px 4px rgba(0,0,0,0.3)"
          >
            {categoryInfo.title}
          </Text>

          {/* Mobile Back Button */}
          <Box
            mt={6}
            display={{ base: "block", md: "none" }}
            zIndex={2}
          >
            <Link
              to="/gallery"
              style={{ textDecoration: 'none' }}
            >
              <Box
                bg="blackAlpha.500"
                backdropFilter="blur(8px)"
                rounded="full"
                display="flex"
                alignItems="center"
                py={2}
                px={4}
                _hover={{
                  bg: "blackAlpha.600"
                }}
                cursor="pointer"
              >
                <ArrowBackIcon color="white" />
                <Text
                  color="white"
                  fontSize="sm"
                  fontWeight="medium"
                  ml={2}
                >
                  Back to Gallery
                </Text>
              </Box>
            </Link>
          </Box>
        </Flex>

        {/* Desktop Back Button */}
        <Box
          position="absolute"
          top="50%"
          left={8}
          transform="translateY(-50%)"
          zIndex={2}
          display={{ base: "none", md: "block" }}
        >
          <IconButton
            as={Link}
            to="/gallery"
            icon={<ArrowBackIcon />}
            aria-label="Back to Gallery"
            size="md"
            bg="blackAlpha.400"
            color="white"
            _hover={{
              bg: "blackAlpha.600",
              transform: "translateX(-2px)"
            }}
            transition="all 0.2s"
            rounded="full"
          />
        </Box>
      </Box>

      {/* Images Grid Section */}
      <Box 
        position="relative" 
        bg="white"
        borderTopRadius="3xl"
        marginTop="-2rem"
        zIndex={1}
        minH="50vh"
        pb={20}
      >
        <Container maxW="container.xl" py={16}>
          <GalleryGrid images={randomizedImages} />
        </Container>
      </Box>
    </Box>
  );
};

export default Gallery; 