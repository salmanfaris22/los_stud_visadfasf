import { Hero } from "@/features/landing/hero";
import { CTA, CoursesShowcase, FAQ, Features, HowItWorks, Stats, Testimonials } from "@/features/landing/sections";
import { getCourses, getSite } from "@/lib/server-api";

export const revalidate = 60;

export default async function HomePage() {
  const [site, courses] = await Promise.all([getSite(), getCourses({ limit: 6 })]);
  const b = site.blocks;
  // The phone in the hero shows this week; the browser switches it to the visitor's own date.
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Hero data={b.hero} today={today} course={courses[0]?.title} />
      <Stats data={b.stats} />
      <Features data={b.features} />
      <CoursesShowcase courses={courses} />
      <HowItWorks data={b.how} />
      <Testimonials data={b.testimonials} />
      <FAQ data={b.faqs} />
      <CTA data={b.cta} />
    </>
  );
}
