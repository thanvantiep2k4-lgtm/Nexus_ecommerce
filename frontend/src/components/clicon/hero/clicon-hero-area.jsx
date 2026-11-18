import React from 'react';
import { Pagination, Navigation, EffectFade, Autoplay } from 'swiper';
import { Swiper, SwiperSlide } from 'swiper/react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useGetBannersQuery } from '@/redux/features/cmsApi';

// Màu nền + khối màu trang trí cho từng slide (xoay vòng)
const SLIDE_THEMES = [
  { bg: '#EEF6E8', shapes: ['#B9E87A', '#F9A8C9', '#7AA7F7'] },
  { bg: '#EAF1FF', shapes: ['#93C5FD', '#FDE68A', '#86EFAC'] },
  { bg: '#FFF1E8', shapes: ['#FDBA74', '#C4B5FD', '#67E8F9'] },
];

const FALLBACK_SLIDES = [
  {
    title: 'Mua sắm thông minh. Sống tiện nghi hơn.',
    desc: 'Hàng chính hãng từ hàng trăm nhà bán uy tín, giao nhanh toàn quốc.',
    image: '',
    link: '/shop',
  },
];

const toSlide = (b) => ({
  _id: b._id,
  title: b.content?.text || b.title,
  desc: b.content?.textVi || '',
  image: b.content?.image || '',
  link: b.content?.buttonUrl || '/shop',
});

const toPromo = (b) => ({
  _id: b._id,
  title: b.content?.text || b.title,
  image: b.content?.image || '',
  link: b.content?.buttonUrl || '/shop',
});

function HeroSlide({ slide, theme, t, priority }) {
  return (
    <div className="nx-hero-slide" style={{ backgroundColor: theme.bg }}>
      <div className="nx-hero-slide__content">
        <h2 className="nx-hero-slide__title">{slide.title}</h2>
        {slide.desc && <p className="nx-hero-slide__desc">{slide.desc}</p>}
        <div className="nx-hero-slide__actions">
          <Link href={slide.link || '/shop'} className="nx-btn nx-btn--primary">
            {t('hero.shopNow', 'Mua ngay')}
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
          <Link href="/shop" className="nx-btn nx-btn--outline">
            {t('hero.exploreDeals', 'Xem ưu đãi')}
          </Link>
        </div>
      </div>
      <div className="nx-hero-slide__visual" aria-hidden={!slide.image}>
        <span className="nx-shape nx-shape--a" style={{ background: theme.shapes[0] }} />
        <span className="nx-shape nx-shape--b" style={{ background: theme.shapes[1] }} />
        <span className="nx-shape nx-shape--c" style={{ background: theme.shapes[2] }} />
        {slide.image && (
          <img
            className="nx-hero-slide__img"
            src={slide.image}
            alt={slide.title}
            loading={priority ? 'eager' : 'lazy'}
            fetchpriority={priority ? 'high' : 'auto'}
          />
        )}
      </div>
    </div>
  );
}

const CliconHeroArea = () => {
  const { t } = useTranslation();
  const { data: heroData } = useGetBannersQuery({ type: 'hero-slide' });
  const { data: promoData } = useGetBannersQuery({ type: 'promotional-banner' });

  const heroBanners = heroData?.data || [];
  const slides = heroBanners.length ? heroBanners.map(toSlide) : FALLBACK_SLIDES;
  const promo = (promoData?.data || []).map(toPromo)[0];

  return (
    <section className="nx-hero" data-testid="clicon-hero-area">
      <div className="container">
        <div className="nx-hero__grid">
          <div className="nx-hero__main">
            <Swiper
              key={`hero-${slides.length}`}
              slidesPerView={1}
              effect="fade"
              fadeEffect={{ crossFade: true }}
              loop={slides.length > 1}
              speed={700}
              autoplay={{ delay: 5000, disableOnInteraction: false, pauseOnMouseEnter: true }}
              navigation={{ prevEl: '.nx-hero__arrow--prev', nextEl: '.nx-hero__arrow--next' }}
              pagination={{ el: '.nx-hero__dots', clickable: true }}
              modules={[Pagination, Navigation, EffectFade, Autoplay]}
              className="cl-hero-swiper nx-hero__swiper"
              data-testid="clicon-hero-swiper"
            >
              {slides.map((slide, idx) => (
                <SwiperSlide key={slide._id || idx}>
                  <HeroSlide
                    slide={slide}
                    theme={SLIDE_THEMES[idx % SLIDE_THEMES.length]}
                    t={t}
                    priority={idx === 0}
                  />
                </SwiperSlide>
              ))}
            </Swiper>
            <button
              type="button"
              className="nx-hero__arrow nx-hero__arrow--prev"
              aria-label={t('aria.prevSlide', 'Slide trước')}
            >
              <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="nx-hero__arrow nx-hero__arrow--next"
              aria-label={t('aria.nextSlide', 'Slide tiếp theo')}
            >
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </button>
            <div className="nx-hero__dots" />
          </div>

          <Link href={promo?.link || '/shop'} className="nx-hero__promo">
            <h3 className="nx-hero__promo-title">
              {t('hero.promoTitle', 'Deal hôm nay, giá không đợi ai')}
            </h3>
            <p className="nx-hero__promo-desc">
              {t('hero.promoDesc', 'Đừng bỏ lỡ ưu đãi tốt nhất trong ngày')}
            </p>
            <span className="nx-btn nx-btn--white">{t('hero.promoCta', 'Săn deal')}</span>
            {promo?.image && (
              <img className="nx-hero__promo-img" src={promo.image} alt={promo.title} />
            )}
          </Link>
        </div>
      </div>
    </section>
  );
};

export default CliconHeroArea;
