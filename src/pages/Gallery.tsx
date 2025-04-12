import { Box, Container, Text, Flex } from '@chakra-ui/react';
import { useParams, Link } from 'react-router-dom';
import { ArrowBackIcon } from '@chakra-ui/icons';
import GalleryCategories from '../components/GalleryCategories';
import GalleryGrid from '../components/GalleryGrid';

// Sample images data structure
const sampleImages = {
  portraits: [
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744428055/IMG_6959_copy_jxexk0.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744427989/IMG_3710_novk5a.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744427902/IMG_3678_dkizqw.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744427870/IMG_3711_zrqb93.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744427382/76567_xurb9l.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744425449/QC6C8144_yecnhu.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744425342/QC6C7945_c5rvex.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744425266/QC6C7740_ixuqy3.jpg' },
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
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744427294/111-02.jp_%D0%BA%D0%BE%D0%BF%D0%B8%D1%8F_qpchzk.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744427237/_C6C0709_q5gvmt.jpg' },
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
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744426596/_C6C2533_rnqh8h.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744426594/_C6C2573_wre0pj.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744426591/_C6C2389_lvysin.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744426591/_C6C2283_ngx2qh.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744426585/_C6C2049_hg8ksq.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744425813/QC6C9310_gafufb.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744420999/_C6C8265_iso5e3.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744420951/_C6C8323_zfeyhx.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744420940/_C6C1962_pgm7xn.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744420883/_C6C5746_m26ork.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744420775/IMG_50511_xrk5hc.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744420667/_C6C9374_eq86x9.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744420048/7654_jngkqk.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744420042/6543_j6wwlb.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744420016/545_nqiclf.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418720/IMG_4618_fbdjzz.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418619/IMG_7655_lcio93.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418565/_C6C2669_z1oyet.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418531/_C6C2278_fahzfa.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418527/_C6C1932_s7ao9r.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744416973/0066_ce14dy.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744416869/_C6C16373_l2cnrk.jpg' }
  ],
  maternity: [
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744426849/QC6C35776_hdhnjl.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744426772/QC6C3516_kjvkfs.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744425064/IMG_6930_vkwj13.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744425038/QC6C3527_g2mug1.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744420003/_C6C90411_bi7gse.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744419996/_C6C89133_xgwivd.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744419990/_C6C9092_gthvhk.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744419985/_C6C8946_pklmnz.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744419478/_C6C8862_b8za5r.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744416674/0765456_h8sivv.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744416508/4567_edlsbl.jpg' },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744416502/0077_rhvzyn.jpg' }
  ],
};

const categoryDetails = {
  portraits: {
    title: 'Portraits',
    description: 'Capturing the essence of individuals through stunning portrait photography.',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744394695/765456_mqaert.jpg',
    backgroundPosition: 'center 50%'
  },
  weddings: {
    title: 'Weddings',
    description: 'Documenting your special day with beautiful and timeless wedding photography.',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415004/05_rfvs8y.jpg',
    backgroundPosition: 'center 25%'
  },
  family: {
    title: 'Family',
    description: 'Preserving precious family moments with heartfelt photography sessions.',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744416869/_C6C16373_l2cnrk.jpg',
    backgroundPosition: 'center 40%'
  },
  maternity: {
    title: 'Maternity',
    description: 'Celebrating the beauty of pregnancy with elegant maternity photography.',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744419478/_C6C8862_b8za5r.jpg',
    backgroundPosition: 'center 35%'
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
          pb={0}
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
          backgroundPosition={categoryInfo.backgroundPosition}
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