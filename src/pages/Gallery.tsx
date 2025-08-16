import { Box, Container, Text, Flex } from '@chakra-ui/react';
import { useParams, Link } from 'react-router-dom';
import { ArrowBackIcon } from '@chakra-ui/icons';
import GalleryCategories from '../components/GalleryCategories';
import GalleryGrid from '../components/GalleryGrid';

// Updated images data structure with metadata (escaped quotes)
const sampleImages = {
  portraits: [
    {
      url: '/assets/photos/IMG_6959_copy_jxexk0.webp',
      alt: 'Woman in swimsuit under palm tree at sunset, gazing peacefully.',
      title: 'Sunset Portrait under Palm Tree | Vero Photography',
      description: 'A woman in a swimsuit stands barefoot beneath a palm tree on a tranquil beach, bathed in the golden light of sunset, lost in a serene moment.'
    },
    {
      url: '/assets/photos/IMG_3710_novk5a.webp',
      alt: 'Woman in swimsuit relaxes on white sand under palm tree at sunset.',
      title: 'Relaxing on White Sand at Sunset | Vero Photography',
      description: 'Relaxing on soft white sand, a woman in a swimsuit basks under a palm tree during a warm sunset, her expression calm and peaceful.'
    },
    {
      url: '/assets/photos/IMG_3678_dkizqw.webp',
      alt: 'Elegant woman in handmade swimsuit posing with seashell decor background.',
      title: 'Handmade Swimsuit & Seashell Decor Portrait | Vero Photography',
      description: 'Captured in soft, natural light, this portrait features a woman wearing a unique handmade swimsuit, seated elegantly before delicate seashell decor.'
    },
    {
      url: '/assets/photos/76567_xurb9l.webp',
      alt: 'Serene black and white portrait of a woman in a swimsuit lying on sand.',
      title: 'B&W Beach Portrait: Woman on Sand | Vero Photography',
      description: 'This black and white portrait captures a woman in a swimsuit lying on the sand, showcasing a serene and timeless moment with soft natural contrast and texture.'
    },
    {
      url: '/assets/photos/IMG_3711_zrqb93.webp',
      alt: 'Joyful girl embracing a large palm leaf against a clear blue sky.',
      title: 'Girl Embracing Palm Leaf | Vero Photography',
      description: 'Against a bright blue sky, a girl joyfully embraces a palm leaf, her expression reflecting happiness and a strong connection with nature\'s beauty.'
    },
    {
      url: '/assets/photos/QC6C8144_yecnhu.webp',
      alt: 'Dynamic scene of a girl in a blue dress riding a horse along the scenic shoreline in Las Galeras.',
      title: 'Horse Riding on Scenic Shoreline | Vero Photography',
      description: 'A stunning beach landscape in Las Galeras features a girl in a flowing blue dress riding a horse along the sandy shore, capturing the essence of freedom and adventure.'
    },
    {
      url: '/assets/photos/QC6C7945_c5rvex.webp',
      alt: 'Intimate close-up split photo showing a girl\'s eye and a horse\'s eye.',
      title: 'Eye Connection: Girl and Horse | Vero Photography',
      description: 'A captivating close-up reveals the eye of a girl on the left and the eye of a horse on the right, showcasing their unique beauty and fostering an intimate connection.'
    },
    {
      url: '/assets/photos/QC6C7740_ixuqy3.webp',
      alt: 'Serene beach scene of a girl petting a horse by the calming waves.',
      title: 'Girl Petting Horse at the Beach | Vero Photography',
      description: 'Against a picturesque beach backdrop, a girl gently pets a horse. This heartwarming scene captures the bond between them amidst the calming waves.'
    },
    {
      url: '/assets/photos/_C6C7147_zexgnh.webp',
      alt: 'Serene portrait of a girl in a blue dress sitting among blooming lotuses in Almaty.',
      title: 'Girl in Blue Dress Among Lotuses | Vero Photography',
      description: 'In a vibrant field of blooming lotuses in Almaty, a girl in a flowing blue dress sits gracefully. The scene presents a beautiful harmony with nature.'
    },
    {
      url: '/assets/photos/_C6C33921_nj0vzv.webp',
      alt: 'Blonde girl with open back silhouetted against a stunning sunset in Almaty.',
      title: 'Sunset Silhouette: Blonde Girl | Vero Photography',
      description: 'A blonde girl stands with her back to the camera, silhouetted by a breathtaking Almaty sunset. The warm sky evokes serenity and introspection.'
    },
    {
      url: '/assets/photos/_C6C7842_ar2new.webp',
      alt: 'Captivating close-up of a beautiful girl\'s eye with a book page texture behind.',
      title: 'Eye Portrait with Book Background | Vero Photography',
      description: 'An intimate close-up features a girl\'s eye, beautifully framed by the soft texture of an open book page, evoking curiosity and a love for literature.'
    },
    {
      url: '/assets/photos/_C6C2698_le8ea3.webp',
      alt: 'Artistic photo: Girl reaching towards a handsome guy, echoing Michelangelo\'s Creation.',
      title: 'Modern Creation Homage | Vero Photography',
      description: 'A contemporary interpretation reminiscent of Michelangelo\'s Creation of Adam: a girl stretches her hand towards a handsome boy, capturing connection and aspiration.'
    },
    {
      url: '/assets/photos/_C6C0250_kgvym7.webp',
      alt: 'Warm portrait of a beautiful girl in red holding a book in a cozy kitchen.',
      title: 'Girl in Red Reading in Kitchen | Vero Photography',
      description: 'A stunning portrait captures a girl in vibrant red within a cozy kitchen, engrossed in a book. The warm ambiance creates a sense of comfort and inspiration.'
    },
    {
      url: '/assets/photos/_C6C0622_nowzuo.webp',
      alt: 'Elegant girl in a black suit posing confidently by a golden lion statue in a sophisticated interior.',
      title: 'Elegant Girl with Golden Lion | Vero Photography',
      description: 'Exuding sophistication, a girl in a sleek black suit stands confidently in a stunning interior, complemented by an impressive golden lion statue.'
    },
    {
      url: '/assets/photos/_C6C0550_jjaeuc.webp',
      alt: 'Two stylish girls, one in black suit, one in white, toasting whiskey in an elegant kitchen.',
      title: 'Stylish Whiskey Toast | Vero Photography',
      description: 'In a beautifully designed kitchen, two girls—one in black, one in white—toast with whiskey, highlighting a moment of friendship and stylish celebration.'
    },
    {
      url: '/assets/photos/_C6C0375_npexhn.webp',
      alt: 'Elegant portrait capturing the timeless beauty of a girl resembling Monica Bellucci.',
      title: 'Monica Bellucci Look-Alike Portrait | Vero Photography',
      description: 'Reminiscent of Monica Bellucci, a stunning portrait features a girl exuding grace and classic allure, creating a timeless and enchanting image.'
    },
    {
      url: '/assets/photos/_C6C0663_kbabsi.webp',
      alt: 'Relaxed lifestyle photo of a beautiful girl in a shirt lying on a table enjoying breakfast in Almaty.',
      title: 'Stylish Breakfast Scene | Vero Photography',
      description: 'Embodying a relaxed morning vibe in Almaty, a stunning girl casually lies on a table in a crisp shirt, savoring her breakfast with a touch of elegance.'
    },
    {
      url: '/assets/photos/_C6C5894_i0gtia.webp',
      alt: 'Artistic portrait: Girl with short hair embracing the head of a Greek-style statue in Almaty.',
      title: 'Girl Embracing Greek Statue | Vero Photography',
      description: 'This striking portrait from Almaty features a girl with short hair gently embracing a Greek-style statue head, highlighting the connection between modern beauty and classical art.'
    },
    {
      url: '/assets/photos/2000jpg_ewkcnf.webp',
      alt: 'Cozy indoor scene of a girl comfortably sitting, drinking tea, and reading a book in Almaty.',
      title: 'Cozy Tea and Reading Moment | Vero Photography',
      description: 'Evoking warmth and relaxation in Almaty, a girl sits comfortably, enjoying tea and immersing herself in a book—a cozy scene of simple pleasures.'
    },
    {
      url: '/assets/photos/QC6C8127_xfctsx.webp',
      alt: 'Dynamic adventure photo: Girl in blue dress riding horse on beach with mountains behind.',
      title: 'Beach Horse Ride with Mountain View | Vero Photography',
      description: 'A girl in a flowing blue dress rides gracefully on horseback along a sandy beach, majestic mountains rising behind. This vibrant scene embodies freedom and adventure.'
    },
    {
      url: '/assets/photos/QC6C3092_mp9qli.webp',
      alt: 'Two beautiful girls in bikinis laughing while riding a horse in the ocean water.',
      title: 'Summer Fun: Girls Riding Horse in Sea | Vero Photography',
      description: 'Two stunning girls in vibrant bikinis joyfully ride a horse through shallow beach waters. This lively scene captures summer fun, friendship, and adventure.'
    },
    {
      url: '/assets/photos/IMG_4656_xasnim.webp',
      alt: 'Tropical aerial view: Girl in red bikini lying on a large palm leaf on the beach.',
      title: 'Aerial View: Red Bikini on Palm Leaf | Vero Photography',
      description: 'From above, a girl in a striking red bikini relaxes on a large palm leaf on the beach. This colorful scene highlights tropical relaxation.'
    },
    {
      url: '/assets/photos/IMG_5689_2_fl8csc.webp',
      alt: 'Relaxed summer photo of a beautiful girl in a pink bikini sitting on the sand.',
      title: 'Pink Bikini Beach Relaxation | Vero Photography',
      description: 'Radiating confidence, a stunning girl in a cheerful pink bikini sits gracefully on the sandy beach, embodying summer relaxation under the warm sun.'
    },
    {
      url: '/assets/photos/IMG_3896_zl0u6l.webp',
      alt: 'Sophisticated portrait of a focused girl in a brown suit playing chess.',
      title: 'Chess Portrait in Brown Suit | Vero Photography',
      description: 'A focused girl in a stylish brown suit plays chess, her intense gaze fixed on the board. This portrait captures strategy, elegance, and intellectual beauty.'
    },
    {
      url: '/assets/photos/154A0186_2_cwv1ub.webp',
      alt: 'Beautiful girl in a pink dress holding a pink lotus flower within a vibrant lotus field.',
      title: 'Girl Holding Lotus in Lotus Field | Vero Photography',
      description: 'Standing gracefully in a vibrant lotus field, a girl in a flowing pink dress gently cradles a pink lotus, embodying beauty, tranquility, and femininity.'
    },
    {
      url: '/assets/photos/_C6C4873_ssggj0.webp',
      alt: 'Elegant studio portrait of a beautiful girl in a white dress and pearl earrings against a white background.',
      title: 'Studio Portrait: White Dress & Pearls | Vero Photography',
      description: 'Against a clean white backdrop, a stunning girl in a white dress and pearl earrings stands gracefully. Natural light enhances her ethereal, timeless beauty.'
    },
    {
      url: '/assets/photos/_C6C4393_dq8vhn.webp',
      alt: 'Striking studio portrait of a girl in vintage clothing holding a saber, on a cyclorama background.',
      title: 'Vintage Style with Saber | Vero Photography',
      description: 'In a studio with a cyclorama background, a striking girl in vintage attire poses confidently with a saber, reflecting a unique blend of grace and empowerment.'
    },
    {
      url: '/assets/photos/авп_cl6hdn.webp',
      alt: 'Nostalgic sunset scene: Girl in vintage dress lying peacefully on the sand.',
      title: 'Vintage Dress on Sand at Sunset | Vero Photography',
      description: 'A girl in a beautiful vintage dress lies gracefully on the sand as the sun sets, casting warm hues. This serene scene evokes nostalgia and peacefulness.'
    },
    {
      url: '/assets/photos/_C6C1095_lqimij.webp',
      alt: 'Joyful girl in shorts standing in a vibrant sunflower field during golden hour sunset.',
      title: 'Sunset Sunflower Field Joy | Vero Photography',
      description: 'Amidst a vibrant sunflower field bathed in golden sunset light, a girl in shorts stands joyfully, embodying summer freedom and nature\'s beauty.'
    },
    {
      url: '/assets/photos/_C6C1737_ilmxhh.webp',
      alt: 'Artistic, serene photo of a topless girl partially hidden in lush, tall grass.',
      title: 'Natural Beauty in Tall Grass | Vero Photography',
      description: 'Artistically posed topless among lush tall grass, a girl embodies freedom and natural beauty. Soft light creates a tranquil, serene atmosphere.'
    },
    {
      url: '/assets/photos/_C6C1344_owaca5.webp',
      alt: 'Bright, cheerful photo of a girl in a yellow tank top surrounded by a sunflower field.',
      title: 'Yellow Tank Top in Sunflowers | Vero Photography',
      description: 'Surrounded by a lush sunflower field, a girl in a vibrant yellow tank top stands joyfully. This bright scene evokes happiness and sunny warmth.'
    },
    {
      url: '/assets/photos/2500_ixvxpa.webp',
      alt: 'Elegant girl in a delicate lace pink dress posing before a stunning blue glacier.',
      title: 'Lace Pink Dress by Blue Glacier | Vero Photography',
      description: 'A girl in a delicate lace pink dress stands gracefully before a breathtaking blue glacier. The contrast creates a striking visual of beauty and nature\'s power.'
    },
    {
      url: '/assets/photos/_C6C33182000_rhcf4y.webp',
      alt: 'Majestic photo of a girl in a long blue gown with train against a magnificent blue glacier.',
      title: 'Blue Gown Majesty by Glacier | Vero Photography',
      description: 'In an exquisite long blue gown with a flowing train, a girl stands majestically before a magnificent blue glacier, creating a stunning image of grace.'
    },
    {
      url: '/assets/photos/_C6C34192500_jb931s.webp',
      alt: 'Elegant portrait: Girl in lace pink dress contrasting beautifully with a blue glacier backdrop.',
      title: 'Pink Lace Dress & Blue Glacier | Vero Photography',
      description: 'A girl in a delicate lace pink dress stands gracefully before a breathtaking blue glacier. The contrast highlights beauty against the power of nature.'
    },
    {
      url: '/assets/photos/IMG_6921_kccbyg.webp',
      alt: 'Vibrant photo capturing the freedom of a beautiful girl in a swimsuit riding a horse against the sky.',
      title: 'Swimsuit Horse Ride Against Sky | Vero Photography',
      description: 'Embodying freedom and joy, a stunning girl in a stylish swimsuit rides a horse against a bright blue sky, celebrating summer beauty and adventure.'
    },
    {
      url: '/assets/photos/IMG_6920_vhaobr.webp',
      alt: 'Striking portrait of a beautiful Black woman adorned with an exotic red flower, showcasing elegance.',
      title: 'Elegant Black Woman with Red Flower | Vero Photography',
      description: 'A striking portrait captures a beautiful Black woman adorned with an exotic red flower, enhancing her natural elegance and celebrating cultural beauty.'
    },
    {
      url: '/assets/photos/_C6C4709_copy_tzkqaa.webp',
      alt: 'Charming portrait of a girl in a straw hat holding a basket of vibrant wildflowers.',
      title: 'Girl with Straw Hat & Wildflowers | Vero Photography',
      description: 'A charming portrait features a girl in a straw hat, gently cradling a basket of vibrant wildflowers, capturing a carefree spirit connected to nature.'
    },
    {
      url: '/assets/photos/_C6C6868_copy_amaout.webp',
      alt: 'Enchanting scene: Girl in a flowing red gown with train standing in a vibrant poppy field.',
      title: 'Red Gown in Poppy Field | Vero Photography',
      description: 'A stunning girl in a flowing red dress with a train stands gracefully amidst a vibrant poppy field, contrasting beautifully with the lush red flowers.'
    },
    {
      url: '/assets/photos/_C6C4032_fyviyu.webp',
      alt: 'Elegant girl in a white dress standing gracefully by a coastal lighthouse.',
      title: 'White Dress at Lighthouse | Vero Photography',
      description: 'Embodying coastal charm, a girl in a flowing white dress stands gracefully by a lighthouse. The serene backdrop highlights elegance and adventure.'
    },
    {
      url: '/assets/photos/IMG_6118_x9khmv.webp',
      alt: 'Glamorous photo of a beautiful blonde woman with curvy figure posing by a luxury yacht.',
      title: 'Luxury Yacht & Blonde Beauty | Vero Photography',
      description: 'Against the backdrop of a luxurious yacht, a captivating blonde woman with stunning curves poses gracefully, exuding elegance and sophisticated style.'
    },
    {
      url: '/assets/photos/_C6C5384_copy_zapuhx.webp',
      alt: 'Serene girl in a vibrant lotus field gently smelling a beautiful lotus flower.',
      title: 'Girl Smelling Lotus Flower | Vero Photography',
      description: 'Standing gracefully in a vibrant lotus field, a girl gently smells a lotus flower, embodying a deep appreciation for nature\'s beauty and peacefulness.'
    },
    {
      url: '/assets/photos/765456_mqaert.webp',
      alt: 'Artistic portrait of a girl covering her face with her hand, creating intriguing shadows.',
      title: 'Shadow Play Portrait | Vero Photography',
      description: 'A striking portrait features a girl gently covering her face, casting intriguing shadows that accentuate her features, evoking mystery and introspection.'
    },
    {
      url: '/assets/photos/IMG_5100_2_r4kcmr.webp',
      alt: 'Vibrant beach photo of a beautiful girl in a chic swimsuit enjoying the summer sun.',
      title: 'Summer Swimsuit Beauty | Vero Photography',
      description: 'Posing confidently in a chic swimsuit on the beach, a stunning girl embodies the spirit of summer with a radiant smile against the sparkling ocean.'
    },
    {
      url: '/assets/photos/IMG_9840_xdmiic.webp',
      alt: 'Athletic girl in a stylish bikini leaning against a bamboo fence near palm trees.',
      title: 'Tropical Bikini Pose | Vero Photography',
      description: 'A girl with a toned physique poses confidently in a beautiful bikini by a bamboo fence with lush palm trees behind, exuding a vibrant tropical atmosphere.'
    },
    {
      url: '/assets/photos/IMG_77601_copy_qystxt.webp',
      alt: 'Relaxed summer scene: Girl in swimsuit reading a magazine leisurely on a haystack.',
      title: 'Reading on a Haystack | Vero Photography',
      description: 'In a peaceful countryside setting, a girl in a stylish swimsuit leisurely reads a magazine on a haystack, embodying summer relaxation and simple pleasures.'
    },
    {
      url: '/assets/photos/09988_wcuogo.webp',
      alt: 'Girl enjoying a picnic meal with food spread out against a beautiful sunset backdrop.',
      title: 'Sunset Picnic Serenity | Vero Photography',
      description: 'Enjoying a picnic spread as the sun sets, a girl is surrounded by stunning colors. The warm sky creates a picturesque backdrop embodying tranquility.'
    },
    {
      url: '/assets/photos/IMG_4768_copy_a1b13h.webp',
      alt: 'Artistic nature photo of two girls posed gracefully against intricate tree roots.',
      title: 'Friendship by Tree Roots | Vero Photography',
      description: 'Two girls stand gracefully against intricate tree roots, their poses reflecting friendship. The unique natural backdrop creates an enchanting scene.'
    },
    {
      url: '/assets/photos/IMG_5509_copy_ouxnki.webp',
      alt: 'Striking black and white photo of a guy standing contemplatively in the ocean waves.',
      title: 'B&W Ocean Contemplation | Vero Photography',
      description: 'A striking black and white image shows a guy standing in the ocean waves. Monochromatic tones emphasize introspection and the raw beauty of the sea.'
    },
    {
      url: '/assets/photos/QC6C6905_copy_cgvysy.webp',
      alt: 'Captivating portrait: Girl with striking green eyes standing among lush palm leaves.',
      title: 'Green Eyes Among Palm Leaves | Vero Photography',
      description: 'A captivating portrait features a girl with striking green eyes amidst lush palm leaves. Vibrant greenery enhances her beauty, creating a serene, exotic atmosphere.'
    },
    {
      url: '/assets/photos/IMG_0289_copy_b5lodk.webp',
      alt: 'Tropical beach scene: Girl in swimsuit holding a palm leaf against the ocean backdrop.',
      title: 'Swimsuit Girl with Palm Leaf | Vero Photography',
      description: 'Against the stunning ocean backdrop, a girl in a stylish swimsuit playfully holds a palm leaf, embodying summer relaxation and tropical joy.'
    },
    {
      url: '/assets/photos/QC6C6660_копия_zqhxlw.webp',
      alt: 'Joyful girl swimming freely in the ocean, submerged up to her neck in sparkling water.',
      title: 'Ocean Swimming Joy | Vero Photography',
      description: 'Swimming effortlessly in the ocean, submerged to her neck, a girl\'s joyful expression and the sparkling waves embody summer exhilaration.'
    }
  ],
  weddings: [
    {
      url: '/assets/photos/111-02.jp_копия_qpchzk.webp',
      alt: 'Tender black and white wedding photo of a couple embracing lovingly.',
      title: 'Loving Wedding Embrace (B&W) | Vero Photography',
      description: 'A couple shares a tender embrace in this black and white wedding photo, radiating love. Monochromatic tones enhance the emotional depth and connection.'
    },
    {
      url: '/assets/photos/_C6C0709_q5gvmt.webp',
      alt: 'Romantic wedding scene: Groom tenderly kissing his bride surrounded by flowers.',
      title: 'Floral Wedding Kiss | Vero Photography',
      description: 'A groom tenderly kisses his bride, surrounded by stunning flowers. The vibrant blossoms create a romantic atmosphere, highlighting their love and joy.'
    },
    {
      url: '/assets/photos/QC6C4557_xa2iye.webp',
      alt: 'Elegant bride and groom posing lovingly in a beautiful interior setting.',
      title: 'Elegant Interior Wedding Portrait | Vero Photography',
      description: 'Radiating joy and elegance, a bride and groom stand together in a stunning interior. The beautiful decor enhances the romantic atmosphere of their love.'
    },
    {
      url: '/assets/photos/QC6C4533_aoi0g7.webp',
      alt: 'Creative wedding photo: Groom photographing his smiling bride in an elegant interior.',
      title: 'Groom Photographing Bride | Vero Photography',
      description: 'A groom focuses his camera on his bride, who smiles joyfully in an elegant interior. The stunning backdrop highlights their connection and creativity.'
    },
    {
      url: '/assets/photos/_C6C4729_hp5p5p.webp',
      alt: 'Beautiful, warm-toned portrait capturing the love and intimacy of a bride and groom.',
      title: 'Warm-Toned Bride & Groom Portrait | Vero Photography',
      description: 'A stunning portrait features a bride and groom radiating love, framed in warm, soft tones. Their expressions reflect happiness and connection.'
    },
    {
      url: '/assets/photos/_C6C7549_p44ynu.webp',
      alt: 'Enchanting photo of a bride standing gracefully in a greenhouse surrounded by lush plants.',
      title: 'Bride in Greenhouse Serenity | Vero Photography',
      description: 'A beautiful bride stands gracefully in a greenhouse surrounded by vibrant plants. Natural light enhances the romantic ambiance and her elegance.'
    },
    {
      url: '/assets/photos/_C6C4657_xnvdyo.webp',
      alt: 'Romantic wedding photo of a bride and groom embracing amidst lush greenery.',
      title: 'Couple Embracing in Greenery | Vero Photography',
      description: 'A bride and groom stand lovingly together amidst vibrant greenery. Their intimate embrace creates a romantic atmosphere highlighting their love.'
    },
    {
      url: '/assets/photos/_C6C0557_qlhoqc.webp',
      alt: 'Magical wedding photo: Bride and groom embracing in a park against a stunning sunset.',
      title: 'Park Sunset Embrace | Vero Photography',
      description: 'A bride and groom embrace in a park, framed by warm sunset hues. Soft light enhances their connection, creating a magical wedding moment.'
    },
    {
      url: '/assets/photos/_C6C23721_jhyzol.webp',
      alt: 'Elegant bride in a beautiful dress holding a bouquet, posing gracefully in an exquisite interior.',
      title: 'Graceful Bride with Bouquet | Vero Photography',
      description: 'In an exquisite interior, a stunning bride in a beautiful gown holds a bouquet, embodying elegance and joy on her wedding day.'
    },
    {
      url: '/assets/photos/_C6C22691_xnm9za.webp',
      alt: 'Intimate black and white photo of a bride and groom sitting together on a sofa in an elegant interior.',
      title: 'B&W Sofa Portrait | Vero Photography',
      description: 'A striking black and white image shows a bride and groom on a beautiful sofa in an elegant interior, conveying intimacy and timeless love.'
    },
    {
      url: '/assets/photos/IMG_1032_rjcgsa.webp',
      alt: 'Romantic beach wedding ceremony: Couple exchanging vows against the ocean backdrop.',
      title: 'Ocean Vows Ceremony | Vero Photography',
      description: 'A couple embraces while exchanging vows against the stunning ocean backdrop, celebrating their love and commitment on this memorable day.'
    },
    {
      url: '/assets/photos/IMG_1094_quo7wq.webp',
      alt: 'Beautiful seaside wedding: Couple embracing while exchanging vows by the ocean.',
      title: 'Seaside Wedding Vows | Vero Photography',
      description: 'Embracing by the ocean, a couple exchanges vows. The beautiful scenery enhances the romantic atmosphere of their special commitment.'
    },
    {
      url: '/assets/photos/IMG_1101_qdv55f.webp',
      alt: 'Joyful newlyweds toasting with champagne, celebrating their wedding day.',
      title: 'Wedding Champagne Celebration | Vero Photography',
      description: 'Radiating joy, happy newlyweds toast with champagne. Their smiles and the celebratory atmosphere capture the essence of their wedding celebration.'
    },
    {
      url: '/assets/photos/DSC03274_mtuzs8.webp',
      alt: 'Detailed close-up of a sparkling engagement ring presented in an elegant ring box.',
      title: 'Engagement Ring Close-Up | Vero Photography',
      description: 'A detailed close-up of a ring box reveals a sparkling engagement ring, emphasizing the significance of love and the promise of a future together.'
    },
    {
      url: '/assets/photos/IMG_8996_copy_y63gjs.webp',
      alt: 'Romantic bride and groom kissing passionately against a scenic ocean and sky backdrop.',
      title: 'Passionate Kiss by the Sea | Vero Photography',
      description: 'A bride and groom kiss passionately, framed by the beautiful sky and serene ocean. This enchanting setting enhances the romance of their special day.'
    },
    {
      url: '/assets/photos/IMG_9193_pv8xq4.webp',
      alt: 'Heartfelt close-up of a bride and groom\'s pinky fingers intertwined, symbolizing commitment.',
      title: 'Pinky Promise Bond | Vero Photography',
      description: 'A heartfelt close-up captures intertwined pinky fingers of a bride and groom, symbolizing their bond, commitment, and the promise of love and unity.'
    },
    {
      url: '/assets/photos/43276CB5-0809-4348-9484-F627D8CC7B13_jkvkda.webp',
      alt: 'Wedding collage: Couple reading newspaper, bride sleeping peacefully, couple & witnesses reading colorful books.',
      title: 'Wedding Moments Collage | Vero Photography',
      description: 'A delightful collage: couple reading newspaper, bride sleeping serenely, and the couple with witnesses reading colorful books, celebrating companionship.'
    },
    {
      url: '/assets/photos/34567_eozg8w.webp',
      alt: 'Emotional black and white photo: Bride crying tears of joy at wedding reception surrounded by guests.',
      title: 'Bride\'s Tears of Joy (B&W) | Vero Photography',
      description: 'A poignant black and white image portrays a bride overwhelmed with tears of joy during her wedding banquet, surrounded by guests celebrating love.'
    },
    {
      url: '/assets/photos/45678_moqymz.webp',
      alt: 'Elegant black and white portrait of a graceful bride wearing a delicate veil.',
      title: 'Elegant Veiled Bride (B&W) | Vero Photography',
      description: 'A stunning black and white portrait features a bride adorned with a delicate veil, radiating elegance. Monochromatic tones create a timeless bridal image.'
    },
    {
      url: '/assets/photos/607CB7D4-0C7F-409F-A06D-233109EEE45F_pv1eds.webp',
      alt: 'Black and white collage showing candid moments of the groom getting ready for his wedding.',
      title: 'Groom Getting Ready Collage (B&W) | Vero Photography',
      description: 'An evocative black and white collage depicts the groom preparing for his wedding, capturing moments of excitement and anticipation for the special day.'
    },
    {
      url: '/assets/photos/41F5FD94-3D27-43A1-B47C-89B43F58C664_tdc8hl.webp',
      alt: 'Beautifully arranged collage of wedding details: close-ups of rings, elegant shoes, and vibrant flowers.',
      title: 'Wedding Details Collage | Vero Photography',
      description: 'This collage showcases intricate wedding details: rings, elegant shoes, and vibrant flowers, reflecting the romantic ambiance and celebration of love.'
    },
    {
      url: '/assets/photos/05_rfvs8y.webp',
      alt: 'Joyful newlyweds running hand-in-hand towards the ocean waves, full of laughter.',
      title: 'Newlyweds Running to the Sea | Vero Photography',
      description: 'Newlyweds joyfully run hand-in-hand towards the ocean, laughter evident as waves approach. The scene embodies adventure and the blissful start of their journey.'
    },
    {
      url: '/assets/photos/01_r3bxzy.webp',
      alt: 'Serene newlyweds sitting closely together on a wooden pier overlooking the shimmering ocean.',
      title: 'Newlyweds on Pier by Ocean | Vero Photography',
      description: 'A serene image of newlyweds sitting closely on a wooden pier, feet dangling above the ocean, reflecting joy and intimacy on their special day.'
    },
    {
      url: '/assets/photos/_C6C9949_xbdpyi.webp',
      alt: 'Heartwarming photo of newlyweds embracing tenderly in a park with a soft, blurred background.',
      title: 'Park Embrace Portrait | Vero Photography',
      description: 'Newlyweds wrap each other in arms within a scenic park. The soft background enhances focus on their joyful expressions and tender embrace.'
    },
    {
      url: '/assets/photos/_C6C7794_po9wdj.webp',
      alt: 'Captivating portrait of a beautiful bride holding a bouquet and looking confidently at the camera.',
      title: 'Confident Bride with Bouquet | Vero Photography',
      description: 'A stunning bride gazes directly at the camera, holding a beautiful bouquet. Her expression radiates confidence and joy on her special day.'
    },
    {
      url: '/assets/photos/_C6C7681_wp8bbb.webp',
      alt: 'Romantic reflection of a couple of newlyweds in a window, showcasing their connection.',
      title: 'Newlyweds\' Window Reflection | Vero Photography',
      description: 'The reflection of newlyweds in a window showcases their love. Subtle light and soft background enhance the romantic atmosphere and their bond.'
    },
    {
      url: '/assets/photos/_C6C65087_ewhiln.webp',
      alt: 'Artistic close-up of hands holding wedding rings, with beautiful interplay of light and shadow.',
      title: 'Wedding Rings Shadow Play | Vero Photography',
      description: 'An artistic image showcases hands holding wedding rings, with intricate shadows adding depth and beauty, symbolizing love, unity, and commitment.'
    },
    {
      url: '/assets/photos/_C6C0601_yhjlbf.webp',
      alt: 'Dreamy photo of a bride lying serenely in a park among flowers, her veil flowing gracefully.',
      title: 'Bride Among Flowers with Veil | Vero Photography',
      description: 'A stunning bride reclines gracefully in a park among vibrant flowers, her flowing veil cascading elegantly, creating a dreamy, romantic atmosphere.'
    },
    {
      url: '/assets/photos/_C6C0529_wrdewc.webp',
      alt: 'Mesmerizing reflection of a newlywed couple in a tranquil lotus pond.',
      title: 'Lotus Pond Reflection | Vero Photography',
      description: 'A mesmerizing image features the reflection of newlyweds in a tranquil lotus pond, symbolizing love and the serene beauty of their special day.'
    },
    {
      url: '/assets/photos/_C6C0084_vcgdtb.webp',
      alt: 'Stunning portrait of an elegant bride with a gracefully flowing veil framing her face.',
      title: 'Elegant Bride with Flowing Veil | Vero Photography',
      description: 'A stunning portrait showcases a bride with a gracefully flowing veil framing her face, highlighting her elegance and the emotion of her wedding day.'
    },
    {
      url: '/assets/photos/QC6C4544_jprmgj.webp',
      alt: 'Romantic still life: Wedding rings resting on a vintage book surrounded by dried roses.',
      title: 'Vintage Book & Rings Still Life | Vero Photography',
      description: 'Wedding rings rest atop an antique book surrounded by delicate dried roses, creating a romantic, nostalgic ambiance symbolizing timeless love.'
    },
    {
      url: '/assets/photos/QC6C4542_haryyr.webp',
      alt: 'Enchanting photo: Wedding rings on vintage book with dried roses and a softly blurred couple behind.',
      title: 'Romantic Still Life with Couple | Vero Photography',
      description: 'Wedding rings on an old book with dried roses, while a couple is softly blurred behind, adding intimacy and symbolizing lasting love.'
    },
    {
      url: '/assets/photos/E0AB1A0C-3430-4A0B-ABD5-857612F6197E_aep7s6.webp',
      alt: 'Engaging collage showing various moments of a groom preparing for his wedding day with excitement.',
      title: 'Groom\'s Wedding Prep Collage | Vero Photography',
      description: 'This engaging collage shows the groom preparing for his wedding: adjusting his tie, polishing shoes, sharing laughs, embodying anticipation and joy.'
    },
    {
      url: '/assets/photos/BDF7C74A-CC72-4501-A46E-0AE2F0D4F5C9_ive4mf.webp',
      alt: 'Artistic black and white collage: Bride with bouquet, wedding rings, and couple in elegant interior.',
      title: 'B&W Wedding Moments Collage | Vero Photography',
      description: 'Artistic B&W collage: bride holding bouquet, close-up of rings, and couple enjoying a moment in an elegant interior, reflecting timeless romance.'
    },
    {
      url: '/assets/photos/_C6C3926_caafmp.webp',
      alt: 'Romantic photo: Groom in botanical garden with bride softly blurred in the background.',
      title: 'Groom in Garden, Blurred Bride | Vero Photography',
      description: 'A groom stands confidently in a vibrant botanical garden, lush greenery around him. The bride is softly blurred behind, adding a dreamy element.'
    },
    {
      url: '/assets/photos/_C6C3980_zzzpzo.webp',
      alt: 'Whimsical wedding photo: Bride and groom posing affectionately with large, elegant white wings.',
      title: 'Winged Couple Fantasy Portrait | Vero Photography',
      description: 'A captivating image features a bride and groom adorned with large white wings in a fantasy-like atmosphere, embodying love, magic, and freedom.'
    },
    {
      url: '/assets/photos/IMG_6916_2_mga9r9.webp',
      alt: 'Stunning, warm-toned portrait of a bride with beautiful light play emphasizing her eyes.',
      title: 'Elegant Bride Portrait with Light Play | Vero Photography',
      description: 'A stunning portrait showcases a bride in warm tones. Soft light dances across her eyes, highlighting elegance, grace, and timeless beauty.'
    },
    {
      url: '/assets/photos/IMG_9132_r8nabt.webp',
      alt: 'Joyful beach wedding celebration: Bride, groom, and guests laughing together by the ocean.',
      title: 'Beach Wedding Celebration | Vero Photography',
      description: 'A bride and groom surrounded by guests on a beautiful beach celebrate their wedding. The stunning ocean backdrop is filled with joy and laughter.'
    },
    {
      url: '/assets/photos/_DSC4218_ugnjse.webp',
      alt: 'Magical wedding night photo: Newlyweds watching a spectacular drone show illuminate the sky.',
      title: 'Newlyweds Under Drone Show | Vero Photography',
      description: 'Newlyweds gaze at a spectacular drone show illuminating the night sky. Vibrant lights create a breathtaking backdrop, celebrating love and magic.'
    },
    {
      url: '/assets/photos/_DSC4069_wi5mfe.webp',
      alt: 'Enchanting wedding celebration: Newlyweds standing before a vibrant drone show against the night sky.',
      title: 'Magical Drone Show Celebration | Vero Photography',
      description: 'A stunning image features newlyweds watching a spectacular drone show light up the night. The vibrant display enhances the romantic atmosphere.'
    }
  ],
  family: [
    {
      url: '/assets/photos/_C6C2533_rnqh8h.webp',
      alt: 'Joyful father and son bonding while eating hot dogs in matching yellow outfits.',
      title: 'Father & Son Hot Dog Fun | Vero Photography',
      description: 'A delightful image captures a father and son sharing a playful moment, enjoying hot dogs in matching bright yellow outfits, showcasing simple joys.'
    },
    {
      url: '/assets/photos/_C6C2573_wre0pj.webp',
      alt: 'Tender moment: Young woman holding a baby gently in a colorful autumn park.',
      title: 'Woman Holding Baby in Autumn | Vero Photography',
      description: 'A heartwarming image: a young woman gently cradles a baby amidst vibrant autumn park colors, highlighting love and connection in nature.'
    },
    {
      url: '/assets/photos/_C6C2389_lvysin.webp',
      alt: 'Warm photo of a young woman holding a baby lovingly in an autumn park setting.',
      title: 'Autumn Park Tenderness | Vero Photography',
      description: 'In a cozy autumn park atmosphere, a young woman holds a baby tenderly. Warm tones and golden leaves highlight their loving connection.'
    },
    {
      url: '/assets/photos/_C6C2283_ngx2qh.webp',
      alt: 'Joyful family outing: Young father with his one-year-old daughter and five-year-old son in autumn park.',
      title: 'Father with Kids in Autumn Park | Vero Photography',
      description: 'A cheerful young father enjoys quality time with his daughter (1) and son (5) in a picturesque autumn park, surrounded by colorful fall leaves.'
    },
    {
      url: '/assets/photos/_C6C2049_hg8ksq.webp',
      alt: 'Heartwarming portrait of a smiling mother and her one-year-old daughter in an autumn forest.',
      title: 'Mother & Daughter Forest Smiles | Vero Photography',
      description: 'A mother and her one-year-old daughter beam with joy amidst vibrant autumn forest colors, highlighting their happy expressions and special bond.'
    },
    {
      url: '/assets/photos/QC6C9310_gafufb.webp',
      alt: 'Happy family portrait: Mother, father, and daughter smiling together in a lush jungle setting.',
      title: 'Jungle Family Adventure | Vero Photography',
      description: 'A joyful family of three smiles brightly amidst lush jungle greenery. The vibrant foliage reflects their adventurous spirit and shared love exploring nature.'
    },
    {
      url: '/assets/photos/_C6C8265_iso5e3.webp',
      alt: 'Generational portrait: Grandmother, mother, sister, and daughter in matching yellow outfits, radiating togetherness.',
      title: 'Four Generations in Yellow | Vero Photography',
      description: 'Four generations of women—grandmother, mother, sister, daughter—in matching yellow outfits radiate joy and togetherness, celebrating family unity.'
    },
    {
      url: '/assets/photos/_C6C8323_zfeyhx.webp',
      alt: 'Sweet moment: Mother and her one-year-old daughter smiling against a soft pink background.',
      title: 'Mother & Daughter on Pink | Vero Photography',
      description: 'A mother and her one-year-old daughter smile joyfully against a soft pink backdrop, the warm tones creating a playful and loving atmosphere.'
    },
    {
      url: '/assets/photos/_C6C1962_pgm7xn.webp',
      alt: 'Joyful family playing with colorful leaves in an enchanting autumn forest.',
      title: 'Autumn Leaf Play | Vero Photography',
      description: 'A family joyfully plays with colorful leaves in an autumn forest. Laughter fills the air as they toss leaves, celebrating the season and family connection.'
    },
    {
      url: '/assets/photos/_C6C5746_m26ork.webp',
      alt: 'Cozy holiday scene: Mother and daughter in pajamas opening Christmas gifts by the tree.',
      title: 'Christmas Morning Gift Opening | Vero Photography',
      description: 'A mother and daughter in cozy pajamas enthusiastically open presents by a decorated Christmas tree, embodying the joy and magic of holiday traditions.'
    },
    {
      url: '/assets/photos/IMG_50511_xrk5hc.webp',
      alt: 'Serene photo of a newborn baby sleeping peacefully, nestled in a cozy basket.',
      title: 'Newborn Peace in a Basket | Vero Photography',
      description: 'A newborn baby sleeps peacefully in a cozy basket wrapped in soft blankets. The gentle pose highlights the beauty and innocence of infancy.'
    },
    {
      url: '/assets/photos/_C6C9374_eq86x9.webp',
      alt: 'Happy family studio photoshoot: Mother, father, and their playful two-year-old son.',
      title: 'Joyful Family Studio Portrait | Vero Photography',
      description: 'A joyful family—mother, father, and playful two-year-old son—in a studio setting. Warm smiles and loving embraces reflect their deep bond.'
    },
    {
      url: '/assets/photos/7654_jngkqk.webp',
      alt: 'Heartwarming family enjoying time together amidst vibrant fall foliage in an autumn park.',
      title: 'Autumn Park Family Fun | Vero Photography',
      description: 'A family happily spends time together in a picturesque autumn park, sharing laughter amidst vibrant fall foliage, embodying warmth and togetherness.'
    },
    {
      url: '/assets/photos/6543_j6wwlb.webp',
      alt: 'Loving family moment: Two daughters tenderly kissing their mother in a colorful autumn forest.',
      title: 'Daughters Kissing Mom in Autumn | Vero Photography',
      description: 'Two daughters tenderly kiss their mother in a beautiful autumn forest. Warm smiles and vibrant fall colors highlight their loving family connection.'
    },
    {
      url: '/assets/photos/545_nqiclf.webp',
      alt: 'Family camping adventure: Enjoying time together with tents set up in the great outdoors.',
      title: 'Family Camping Adventure | Vero Photography',
      description: 'A family enjoys a camping adventure surrounded by tents outdoors. Laughter fills the air as they create lasting memories amidst the natural landscape.'
    },
    {
      url: '/assets/photos/IMG_4618_fbdjzz.webp',
      alt: 'Large, happy family gathered together on the sandy beach by the ocean, sharing smiles.',
      title: 'Large Family Beach Gathering | Vero Photography',
      description: 'A large family happily gathers on the beach by the ocean, sharing smiles and laughter, creating a lively atmosphere of love and togetherness.'
    },
    {
      url: '/assets/photos/IMG_7655_lcio93.webp',
      alt: 'Group of friends having fun and laughing together against the sparkling ocean backdrop.',
      title: 'Friends\' Beach Fun | Vero Photography',
      description: 'Friends enjoy themselves on the beach by the sparkling ocean. Joyful expressions reflect carefree friendship and the excitement of a day by the sea.'
    },
    {
      url: '/assets/photos/_C6C2669_z1oyet.webp',
      alt: 'Peaceful newborn baby sleeping soundly, nestled comfortably in a cozy crib.',
      title: 'Sleeping Newborn in Crib | Vero Photography',
      description: 'A newborn baby nestled comfortably in a cozy crib sleeps soundly. Soft blankets and gentle lighting create a serene atmosphere of innocence.'
    },
    {
      url: '/assets/photos/_C6C2278_fahzfa.webp',
      alt: 'Delightful sisters bonding: Five-year-old cooking playfully with her two-year-old sibling in the kitchen.',
      title: 'Sisters Cooking Together | Vero Photography',
      description: 'A five-year-old sister and her two-year-old sibling joyfully prepare food together, their smiles highlighting the warmth of sibling bonding and fun.'
    },
    {
      url: '/assets/photos/_C6C1932_s7ao9r.webp',
      alt: 'Adorable photo of two young sisters in cute fox costumes posing playfully in a studio.',
      title: 'Sisters in Fox Costumes | Vero Photography',
      description: 'Two sisters dressed in cute fox costumes playfully pose in a studio. Bright smiles and spirited expressions highlight their creativity and joy.'
    },
    {
      url: '/assets/photos/0066_ce14dy.webp',
      alt: 'Harmonious family dressed in white standing together on the beach by the ocean waves.',
      title: 'Family in White on Beach | Vero Photography',
      description: 'A family in elegant white outfits stands together on the beach by the ocean waves. Joyful expressions create a sense of harmony and togetherness.'
    },
    {
      url: '/assets/photos/_C6C16373_l2cnrk.webp',
      alt: 'Elegant family portrait against a black background, highlighted by artistic studio lighting.',
      title: 'Elegant Family Studio Portrait | Vero Photography',
      description: 'A family poses beautifully against a black background under soft studio lighting. The warm glow highlights their features, conveying unity and love.'
    }
  ],
  maternity: [
    {
      url: '/assets/photos/QC6C35776_hdhnjl.webp',
      alt: 'Loving husband tenderly kissing his pregnant wife, who wears a crown and lace dress.',
      title: 'Husband Kissing Pregnant Wife | Vero Photography',
      description: 'A husband tenderly kisses his pregnant wife, adorned with a crown and elegant lace dress, capturing love and anticipation for parenthood.'
    },
    {
      url: '/assets/photos/QC6C3516_kjvkfs.webp',
      alt: 'Serene maternity photo: Pregnant woman in an elegant lace dress posing by the ocean.',
      title: 'Maternity Lace Dress by Ocean | Vero Photography',
      description: 'A pregnant woman poses elegantly in a beautiful lace dress on the beach by the ocean, embodying the beauty of motherhood and tranquility.'
    },
    {
      url: '/assets/photos/IMG_6930_vkwj13.webp',
      alt: 'Beautiful pregnant woman in a lace dress standing gracefully by the ocean shore.',
      title: 'Ocean Serenity Maternity | Vero Photography',
      description: 'Elegantly posed in a beautiful lace dress on the beach, a pregnant woman stands by the ocean waves, capturing a peaceful moment of motherhood.'
    },
    {
      url: '/assets/photos/QC6C3527_g2mug1.webp',
      alt: 'Loving couple by the ocean: Husband with his pregnant wife in a beautiful lace dress.',
      title: 'Couple\'s Ocean Maternity | Vero Photography',
      description: 'A husband stands beside his pregnant wife in a stunning lace dress on the beach, their joyful expressions highlighting shared love and anticipation.'
    },
    {
      url: '/assets/photos/_C6C90411_bi7gse.webp',
      alt: 'Joyful celebration: Three pregnant women in vibrant, flowing dresses standing together on the beach.',
      title: 'Pregnant Friends in Colorful Dresses | Vero Photography',
      description: 'Three pregnant women in colorful, flowing gowns stand together on the beach, dresses billowing gracefully, embodying motherhood and friendship.'
    },
    {
      url: '/assets/photos/_C6C89133_xgwivd.webp',
      alt: 'Elegant maternity photo: Pregnant woman in a flowing gown with train posing by the ocean shore.',
      title: 'Flowing Gown Maternity by Sea | Vero Photography',
      description: 'A pregnant woman poses gracefully on the beach in a beautiful gown with a flowing train, creating a dreamy effect against the vast ocean backdrop.'
    },
    {
      url: '/assets/photos/_C6C9092_gthvhk.webp',
      alt: 'Heartfelt moment: Couple holding an ultrasound image lovingly by the ocean.',
      title: 'Couple Holding Ultrasound by Ocean | Vero Photography',
      description: 'Standing on the beach, a couple lovingly holds an ultrasound image. This beautiful moment symbolizes their excitement and anticipation for parenthood.'
    },
    {
      url: '/assets/photos/_C6C8946_pklmnz.webp',
      alt: 'Loving couple on the beach: Pregnant woman cradling her baby bump beside her partner.',
      title: 'Beach Maternity Togetherness | Vero Photography',
      description: 'A young man and his pregnant partner stand hand-in-hand on the shore. She lovingly cradles her baby bump, reflecting their shared joy and anticipation.'
    },
    {
      url: '/assets/photos/_C6C8862_b8za5r.webp',
      alt: 'Touching beach photo: Young couple standing together, pregnant woman holding her baby bump.',
      title: 'Couple\'s Beach Baby Bump Moment | Vero Photography',
      description: 'Standing hand-in-hand on the sandy shore, a young couple shares warm smiles as the pregnant partner cradles her baby bump, celebrating their love.'
    },
    {
      url: '/assets/photos/0765456_h8sivv.webp',
      alt: 'Elegant pregnant woman posing gracefully in a beautiful dress within a photo studio.',
      title: 'Studio Maternity Elegance | Vero Photography',
      description: 'A pregnant woman poses gracefully in a gorgeous dress in a professional photo studio. Soft lighting highlights her features and radiant glow.'
    },
    {
      url: '/assets/photos/4567_edlsbl.webp',
      alt: 'Beautiful studio maternity portrait: Pregnant woman posing elegantly in a flowing dress.',
      title: 'Elegant Studio Maternity Pose | Vero Photography',
      description: 'In a photo studio, a pregnant woman poses elegantly in a gorgeous dress. The intimate moment showcases the beauty and joy of pregnancy.'
    },
    {
      url: '/assets/photos/0077_rhvzyn.webp',
      alt: 'Touching black and white portrait of a pregnant woman standing closely with her husband.',
      title: 'B&W Maternity Portrait with Husband | Vero Photography',
      description: 'A touching B&W image: a pregnant woman rests her hand on her baby bump beside her husband, their expressions conveying warmth and affection.'
    }
  ]
};

const categoryDetails = {
  portraits: {
    title: 'Portraits',
    description: 'Capturing the essence of individuals through stunning portrait photography.',
    image: '/assets/photos/765456_mqaert.webp',
    backgroundPosition: 'center 50%'
  },
  weddings: {
    title: 'Weddings',
    description: 'Documenting your special day with beautiful and timeless wedding photography.',
    image: '/assets/photos/05_rfvs8y.webp',
    backgroundPosition: 'center 25%'
  },
  family: {
    title: 'Family',
    description: 'Preserving precious family moments with heartfelt photography sessions.',
    image: '/assets/photos/_C6C16373_l2cnrk.webp',
    backgroundPosition: 'center 40%'
  },
  maternity: {
    title: 'Maternity',
    description: 'Celebrating the beauty of pregnancy with elegant maternity photography.',
    image: '/assets/photos/_C6C8862_b8za5r.webp',
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
            backgroundImage={`url(/assets/photos/_C6C1095_lqimij.webp)`}
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
          <Container maxW="full" px={4} py={2}>
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
        zIndex={5}
        minH="50vh"
        pb={20}
      >
        <Container maxW="full" py={4} px={12}>
          <GalleryGrid images={randomizedImages} />
        </Container>
      </Box>
    </Box>
  );
};

export default Gallery; 