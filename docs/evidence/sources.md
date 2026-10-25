# Ballroom Quest: outside evidence (motivation, competitors, learning science)

Written by the research evidence agent. All pages accessed **2026-10-25**.

**Status labels**
- **VERIFIED**: I opened the page and read the number or claim there.
- **SNIPPET**: only a search-engine summary was available because the page blocked automated reading (403, cookie wall or bot checkpoint). I did not try to get around those blocks. Use with a caveat, or leave it out.
- **UNVERIFIED**: I could not confirm it. Do not state it as fact.
- **OUR CALC**: our own arithmetic on the sourced numbers.
- **OWN OBSERVATION**: Sam's first-hand experience, with no outside source.

**Quote rule**: each source has at most one quote, under 15 words, in quotation marks. Everything else is paraphrased.

---

## A. Motivation: who has the problem and what it costs

### A1. Private dance lessons in US cities cost about $75–$100 per hour. VERIFIED
- Source: Thumbtack, "How much will your private dance lessons cost?" https://www.thumbtack.com/p/private-dance-lessons-cost
- Publisher: Thumbtack, a cost-aggregator marketplace. The page says "Last updated Mon, Oct 20" without a year. Its title says 2025 and the footer says 2026.
- What it says: one-on-one lessons cost $75–$100 an hour in most US cities. Ballroom (waltz, rumba, foxtrot, cha-cha) is listed at **$80–$100/hr**. Private lessons usually cost **2–3x** a group class. The national average for a booked job is $152 (range $90–$259), but that is a total per job, not an hourly rate.
- Quote: "$75-$100 an hour for one-on-one dance lessons in most US cities"

### A2. Superprof gives wider ranges for private and group classes. VERIFIED
- Source: Superprof blog, "Dance lesson cost", dated **2025-03-24**. https://www.superprof.com/blog/dance-lesson-cost/ (Lessons.com/costs/dance-lessons-cost now redirects here.)
- Publisher: Superprof, a tutoring marketplace.
- What it says: private lessons cost **$50–$120/hr** in its table and "$50 to $85+" an hour in the text. Group lessons cost about **$12–$20 per hour**. Traditional group classes cost **$60–$200 per month**. The average for ballroom tutors on Superprof's own platform is **$46/hr**. That is a marketplace average and is likely lower than studio prices.

### A3. Studio chain example: Arthur Murray (The Woodlands, TX). VERIFIED
- Source: https://www.arthurmurray.com/thewoodlands/2026/06/how-much-do-dance-lessons-cost-in-the-woodlands-tx/
- Publisher: an Arthur Murray franchise studio. The page shows no date; the URL path says 2026/06.
- What it says: the first introductory private lesson is **$35 for 30 minutes**. The studio does not quote full program prices before that first lesson. Prices are set by each local studio, and the chain publishes no national price list.

### A4. College club budget example: Carnegie Mellon Ballroom Dance Club, FY2012 (old). VERIFIED
- Source: https://www.cmu.edu/stugov/budgettracker/organizations/8/budgets/374.html
- Publisher: CMU Student Government budget tracker. The data cover July 2011 to June 2012.
- What it says: professional instructors for group lessons were budgeted at **$90/hr**, and private lessons at a spring workshop at **$110/hr**. These figures are 14 years old. Use them only as a sign that rates have long been in this range.

### A5. Collegiate team dues are cheap per group lesson: RPI Ballroom example. VERIFIED
- Source: https://ballroom.union.rpi.edu/pricing (page says "Last modified: August 27 2026"). Team policies: https://ballroom.union.rpi.edu/team_policies
- Publisher: RPI Ballroom Dance Club and Team (student organisation).
- What it says: student club dues are **$75 per semester** (or $125 for a full year), plus **$60 per semester** for team dues. That pays for **3 lessons a week, 27 per semester**. Team dues also give access to the coach's private lessons on campus, which are priced separately (no price is listed).
- OUR CALC: ($75 + $60) / 27 = **about $5.00 per group lesson** for a team member. A private lesson at $75–$100/hr (A1) costs about 15–20 times that group lesson, though the group lesson length is not stated. This is the gap a novice faces: group lessons are cheap but give little individual attention, while private lessons give attention but are expensive.

### A6. What YBDT is. VERIFIED
- Source: Yale College Arts, "Yale Ballroom Dance Team (YBDT)". https://collegearts.yale.edu/organizations/alliance-dance-yale/dance-groups/yale-ballroom-dance-team-ybdt
- Publisher: Yale College Arts.
- What it says: YBDT dances International Standard, International Latin, American Smooth and American Rhythm, plus social dances (salsa, merengue, bachata, hustle). It dances for competitions, performances and fun. The linked Yale Ballroom Dance Club needs no prior experience and no partner. These are the same five style groups as the five rooms in Ballroom Quest.
- Quote: "for competitions, for performances, and most of all for fun"

### A7. How many competitions YBDT attends. SNIPPET (not confirmed)
- Source: Yale Daily News, "The artist, the athlete, the dancer" (2012). https://yaledailynews.com/articles/the-artist-the-athlete-the-dancer
- Search summaries say YBDT dancers attend **six to eight scored competitions a year** and that scores count toward a team total. The page was behind a bot checkpoint, so I could not read it. The article is from 2012. **Do not state this as current fact.** If it is used at all, label it "2012 report, uncertain".

### A8. Example December collegiate competition and the rules it uses (Princeton). VERIFIED
- Source: Princeton Ballroom Dance Competition page. https://swh.princeton.edu/~pbdc/competition.html
- Publisher: Princeton Ballroom Dance Club.
- What it says: the competition was held **Sunday, December 7, 2025** at Dillon Gym, Princeton NJ, with Newcomer, Bronze, Silver and Gold levels in Smooth, Standard, Rhythm and Latin. Student registration cost **$40–$50**, depending on how early you registered. **Newcomer** was open only to dancers who started after 1 December 2024 (about a one-year window). Newcomer and Bronze use the **ISTD Bronze syllabus** for International style and the **USISTD Bronze syllabus** for American style. Eligibility uses the YCN point system: 7 or more points makes a dancer ineligible for that level.
- Caveat: no 2026 date is listed. **I did not confirm which December 2026 competition YBDT will attend.** Use this only as an example of the kind of December competition novices prepare for.

### A9. Closed-syllabus rules are enforced, and breaking them has a cost (Berkeley Classic). VERIFIED
- Source: Berkeley Classic 2025, "Competition rules and guidelines". https://ballroom.studentorg.berkeley.edu/24th-annual-berkeley-classic-2025/competition-rules-and-guidelines
- Publisher: UC Berkeley Ballroom Dance team.
- What it says: Newcomer is for couples where both partners started less than a year ago. Newcomer and Bronze may dance **only Bronze syllabus choreography**. For International style that means the ISTD Bronze figures. A judge or invigilator enforces the syllabus.
- Quote: "a warning, lower placement, or disqualification from placement"
- Why it matters: this is the outside reason for Ballroom Quest's deterministic rule checker (`check_routine`, `/api/check`). A novice who builds a routine with an off-syllabus figure risks a lower placement.

### A10. Scale of collegiate ballroom (one data point). VERIFIED
- Source: University of Hawaiʻi News, "Ballroom dance national champs 2026" (2026-04-07). https://www.hawaii.edu/news/2026/04/07/ballroom-dance-national-champs-2026/
- What it says: the team competed against **37 colleges** at the USA Dance National Collegiate DanceSport Championships in Pittsburgh, **March 27–29, 2026**. Some events had up to 70 competitors.
- Caveat: this counts one event's colleges, not all US teams. I found no national count of teams (USA Dance's college page returned 403).

### A11. The core problem: in big team lessons, novices can't see the instructors' feet. OWN OBSERVATION
- No outside source. This comes from Sam's experience as a YBDT novice. Label it as Sam's observation. It becomes evidence only once the teammate trial (trial/TRIAL_KIT.md) measures it.

### A12. Example cost of catching up before December. OUR CALC (illustration only)
- Assumption: the December 2026 competition is about 6 weeks after 2026-10-25. Princeton 2025 was on Dec 7, but the 2026 date is not confirmed.
- Six weekly private lessons at $75–$100/hr (A1) cost **$450–$600** per novice. One private lesson a week for a 13-week semester costs **$975–$1,300**.
- Present this as an illustration built from A1, not as a measured cost.

---

## B. Named existing products: what each does and what it lacks compared with Ballroom Quest

Ballroom Quest has these capabilities (from the project brief, not outside sources):
- (1) 3D footwork shown from your own role (leader or follower) with glowing footprints.
- (2) A routine builder that checks routines against the team syllabus (151 figures, 22 dances, 5 styles).
- (3) An AI coach (Coach Marisol) grounded on the team's own syllabus through deterministic tools.
- (4) A Drill Builder that turns teammates' lesson notes into drills.
- (5) A Practice Planner that plans up to the competition date.
- (6) On-beat rhythm-game practice.

### B1. Dance Reality (AR footprints app; the closest competitor)
- Sources:
  - Developer site, VERIFIED: https://www.dancerealityapp.com/dancerealityapp and https://dancerealityapp.com
  - UploadVR, 2017-07-16, VERIFIED: https://uploadvr.com/arkit-app-uses-virtual-footsteps-show-dance/
- What it does: through a phone or tablet's AR, it places animated footprints on your floor and you step on them. It has adjustable speed, a counting voice-over, music for each style, and solo and couple modes. You can **choose lead or follow steps**. Some classes have virtual instructors. Named styles are salsa, bachata, waltz and hip-hop. It needs an ARKit or ARCore device. The developer says it does not replace in-person teaching. The same company also makes a separate VR salsa app with an "AI dance partner".
- Quote (developer site): "Choose between Follow and Lead steps"
- Price: **UNVERIFIED**. The developer site gives no price. One aggregator summary said the iOS app was free with a last update in June 2020 (SNIPPET only). The US App Store page I tried returned 404.
- What it lacks compared with Ballroom Quest:
  - It has no team or collegiate syllabus coverage across Standard, Latin, Smooth and Rhythm. Of the ballroom dances, only waltz is named.
  - I found no routine builder or syllabus rule check.
  - It has no AI coach grounded on a team's own syllabus, no drills from lesson notes, and no competition planner.
- Fair note: its live AR on your real floor is something Ballroom Quest does not do.

### B2. BallroomDancers.com (online lesson video library). VERIFIED
- Source: https://www.ballroomdancers.com/
- What it does: a Learning Center with "Learn the Basics", "Learn the Dances" and "Variation of the Week". Premium gives access to **over 1,620 video demonstrations of patterns** at bronze, silver and gold, across International Standard, International Latin, American Smooth, American Rhythm and Social/Nightclub. Premium also includes full video of the **man's and lady's parts** for past variations of the week.
- Price: **$99 per year** to upgrade to Premium and **$79 per year** to renew.
- Quote: "Exclusive access to over 1,620 video demonstrations of patterns"
- What it lacks compared with Ballroom Quest: it is flat video, so you cannot change your viewpoint in 3D. I found no routine builder or syllabus rule check, no AI coach, no team drills, no planner and no on-beat practice game.

### B3. Dance Vision Syllabus (DVIDA syllabus video platform and app). VERIFIED
- Sources:
  - Pricing: https://help.dancevision.com/signing-up-and-pricing
  - Syllabus: https://dancevision.com/syllabus
  - App: https://apps.apple.com/us/app/dance-vision-syllabus/id1461427008
- What it does: **6,000+ video lessons** in **13 styles** (including American Smooth and Rhythm, International Ballroom and Latin, and nightclub styles). Levels are Bronze, Silver and Gold, each in 4 sub-levels. Progress charts let you mark mastery and set goals. The app has looping, speed control and offline downloads. There are Team plans for studios. App reviewers mention follower charts.
- Price: **$199 per year** (7-day free trial). A free tier covers "Anyone Can Dance" and most Bronze 1 figures. The app itself is a free download.
- Quote: "Short, uncomplicated figures that combine freely" (it says figures combine, but I found no tool for building routines).
- What it lacks compared with Ballroom Quest: it is video, not a 3D view from your own role. I found no routine builder or rule check, and no AI coach. Team plans manage seats; they do not turn a team's own lesson notes into drills. Goal-setting exists, but there is no planner tied to a competition date. It has no on-beat practice game.
- Fair note: it is far larger and taught by professionals.

### B4. STEEZY (online dance classes, not ballroom). VERIFIED
- Source: App Store, https://apps.apple.com/us/app/steezy-learn-how-to-dance/id1296001664
- What it does: **1,000+ classes** in hip-hop, ballet, contemporary, jazz, K-pop, house, breaking, heels and other styles. You can watch from several angles, slow the tempo and loop a section. It has guided programs, challenges and leaderboards. **No ballroom style is listed.**
- Price: Standard Monthly **$19.99**, Standard Yearly **$99.99**. Other in-app tiers are listed, including Basic $9.99/month and $59.99/year.
- Quote: "an auto-renewing yearly subscription at $99.99/year"
- What it lacks compared with Ballroom Quest: it has no partner dancing, so no leader or follower roles, no ballroom syllabus, no routine rule check, no AI coach, no team drills and no competition planner.
- Fair note: its multi-angle, tempo and loop tools are a well-known pattern for teaching from video.

### B5. Just Dance / Just Dance+ (Ubisoft dance game). VERIFIED
- Sources:
  - Pricing announcement, 2026-01-27: https://news.ubisoft.com/en-us/article/3MdXqG1y9GD3DvMr1Sf8OD/just-dance-pricing-update-and-whats-ahead-in-2026
  - Game modes, 2025-10-08: https://www.ubisoft.com/en-us/game/just-dance/2026/news-updates/5lXkJAggFhXne0x75Pg5O2/2-new-game-modes-coming-to-just-dance-2026-edition
- What it does: you copy on-screen dancers to pop songs and get points for each move. A phone acts as the controller, and the new Camera Controller mode uses the phone camera to track your **full body** (solo only). Just Dance+ is a streaming catalogue of songs.
- Price: Just Dance+ costs **$4.99 for 1 month, $12.99 for 3 months and $29.99 for 12 months** (US, from April 2026).
- Quote: "tracks your full-body movements"
- What it lacks compared with Ballroom Quest: it has no ballroom syllabus, no partner roles, no figure-by-figure footwork and no routine building. Its choreography is fixed, and there is no coach, no team drills and no planner.
- Fair note: it proves that scoring on the beat is engaging. Ballroom Quest's rhythm mode borrows that idea.

### B6. DanzDB (ballroom figure reference app). VERIFIED
- Source: App Store, https://apps.apple.com/app/id6759789833 (developer Thorsten Domke)
- What it does: an offline reference of **200+ figures** in **15 styles**: Standard, Latin and social dances such as Discofox, Salsa and Polka. Each figure has a name, step count, description and level. Premium adds personal notes, iCloud sync and custom levels.
- Price: free, or **$4.99** one-time to unlock the full version.
- What it lacks compared with Ballroom Quest: it has no 3D or animated footwork view, no American Smooth or Rhythm (not listed), no routine building or rule check, no AI, no team drills and no planner.

### B7. Choreography Generator (ballroom routine generator). SNIPPET / UNVERIFIED
- Source: https://appshunter.io/ios/app/choreography-generator/id1562609753 (page returned 403; search summary only)
- According to the summary, this was an archived iOS app, no longer on the App Store, that generated Standard routines (Waltz, Foxtrot, Tango, Quickstep) at three levels. Its last update was in 2021, and a reviewer said demo videos were missing. **Mention it only as "a discontinued routine-generator app (unverified)", or leave it out.**

### B8. YouTube tutorials (generic). OWN ASSESSMENT
- No single source. Videos are free and plentiful, but quality and syllabus match vary. Most are filmed from the front, so the viewer must mirror and translate the steps to their own role. There is no rule check, no feedback and no plan. Label this as our assessment.

### B9. Private coaching (the gold standard). Sources A1–A4
- Costs **$75–$100/hr** in most US cities (Thumbtack). It gives live, personal feedback on the dancer's body, which Ballroom Quest cannot do.
- Positioning: Ballroom Quest is meant for practice **between** lessons. It does not replace a coach.

### B10. Camera-based AI dance coaches, and why they struggle with ballroom couples. VERIFIED (research) / SNIPPET (apps)
- Research, VERIFIED: Lewen Ivy Huang, "Investigating AI Model Limitations in Recognizing Faces and Bodies in Ballroom Dance Settings", IHIET-AI 2024, AHFE Open Access, DOI 10.54941/ahfe1004599. https://openaccess.cms-conferences.org/publications/book/978-1-958651-96-4/article/978-1-958651-96-4_49
  - Findings: four common body and face detection models were tested on images of ballroom couples. They were more likely to detect the man than the woman, especially when she leaned back. They often merged the couple into one person. Errors were frequent when dancers faced away from the camera or wore competition costumes.
  - Quote: "they are more likely to detect the man than the woman in the dyad"
  - Why it matters: this supports Ballroom Quest's choice to show correct footwork and check routines with rules, rather than grade the player through a camera. It also belongs in the limits section, because the game cannot see the player's own body.
- Apps, SNIPPET only: MoovMyWay (camera scoring; hip-hop, K-pop, salsa and similar, no ballroom listed) and Dance Helper (pose-estimation coach). Name them only as "camera-based AI coach apps exist for solo styles".

### B11. Research precedent: motion-capture VR dance training. VERIFIED (secondary summary; IEEE page not opened)
- Source: Chan, Leung, Tang & Komura, "A Virtual Reality Dance Training System Using Motion Capture Technology", IEEE Transactions on Learning Technologies 4(2):187–195, 2011, DOI 10.1109/TLT.2010.27. Read via the DancePedia summary: https://scrapbox.io/DancePedia/A_Virtual_Reality_Dance_Training_System_Using_Motion_Capture_Technology
- Findings: students copied a virtual teacher, and motion capture gave them feedback. In user studies, students' skills improved and they found the system motivating. This was a lab system for solo dance, not a product.
- Quote: "can successfully guide students to improve their skills"

---

## C. Learning science (keep claims modest)

### C1. Watching a model helps people copy the form of a movement more than it improves outcome scores. VERIFIED (abstract)
- Source: Ashford, Bennett & Davids, "Observational modeling effects for movement dynamics and movement outcome measures across differing task constraints: a meta-analysis", *Journal of Motor Behavior* 38(3):185–205, DOI 10.3200/JMBR.38.3.185-205. Read via the Sheffield Hallam repository: https://shura.shu.ac.uk/3302
  - Year: volume 38 is 2006. The repository lists 2007; cite it as 2006.
- Findings: compared with practice alone, watching a demonstration had an average effect of **δ = 0.77 on movement form (dynamics)** but only **δ = 0.17 on movement outcome**. For **serial tasks** (sequences of linked movements, like a dance figure) the effects were largest: **1.62 (form) and 0.61 (outcome)**.
- Quote: "far stronger for MD than for MO measures"
- Safe wording: "A meta-analysis found that watching a demonstration mainly helps learners copy the shape and timing of a movement, most of all for sequences of movements."

### C2. Alternating watching and doing beat either one alone (single lab study). VERIFIED
- Source: Bazzini et al., "The Proactive Synergy Between Action Observation and Execution in the Acquisition of New Motor Skills", *Frontiers in Human Neuroscience* 16, 2022-03-24, DOI 10.3389/fnhum.2022.793849. https://www.frontiersin.org/articles/10.3389/fnhum.2022.793849/full
- Findings: 54 adults learned 6 nautical knots. Success rose **42%** with alternating observation and execution, **25%** with observation only, and **10%** with practice only.
- Quote: "The AOT group exhibited the highest performance improvement (42%)"
- Caveats: one small study of a hand task, not dance. Use it as "consistent with" the watch-then-play loop, not as proof.

### C3. Spacing practice across days helps learning and retention. VERIFIED (via review) / SNIPPET (original abstract)
- Original: Shea, Lai, Black & Park (2000), "Spacing practice sessions across days benefits the learning of motor skills", *Human Movement Science* 19(5):737–760, DOI 10.1016/S0167-9457(00)00021-X. ScienceDirect returned 403, so the abstract was seen only as a search summary.
- Review, VERIFIED: Smith & Scarf (2017), "Spacing Repetitions Over Long Timescales: A Review and a Reconsolidation Explanation", *Frontiers in Psychology* 8, DOI 10.3389/fpsyg.2017.00962. https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.00962/full
  - The review describes Shea et al.: a group that practiced a timing task over 3 days outperformed a group that did the same amount of practice in one day.
- Quote (review): "spaced practice generally leads to better learning and retention"
- Why it matters: this supports the Practice Planner spreading short sessions across the weeks before the competition.

### C4. Practice matters, but it does not explain everything. VERIFIED (via press release; PubMed blocked by a cookie wall)
- Source: Macnamara, Hambrick & Oswald (2014), "Deliberate practice and performance in music, games, sports, education, and professions: a meta-analysis", *Psychological Science* 25(8):1608–1618, DOI 10.1177/0956797614535810, PMID 24986855. Numbers read from ScienceDaily (Rice University release), 2014-07-18: https://www.sciencedaily.com/releases/2014/07/140716123835.htm
- Findings: deliberate practice explained **18%** of the differences in performance in **sports**, 26% in games, 21% in music, 4% in education and under 1% in professions.
- Use: to keep the impact claims honest. More focused practice is likely to help, but it is one factor among many (partner, coaching, talent, nerves).

**Suggested modest summary sentence for the report:** "Research suggests three things. Watching a clear demonstration mainly helps people copy the form of a movement sequence (C1). Alternating watching and doing worked better than either alone in one lab study (C2). Spreading practice over days helps retention (C3). None of these studies tested ballroom or Ballroom Quest, so whether the game helps YBDT novices is uncertain until the trial is run."

---

## D. Comparison table (product × capability)

Key:
- **Yes**: the page states it.
- **Part.**: partly present.
- **No**: the page clearly does not offer it, or the feature makes no sense for the product (for example, no partner roles in solo styles).
- **n.f.**: not found on the pages we checked. The feature may exist; we did not see it.
- **?**: unknown.

| Product | Ballroom syllabus (Std/Latin/Smooth/Rhythm) | Footwork from your own role (lead/follow) | 3D/AR view, any angle | Build own routine + syllabus rule check | AI coach on your team's syllabus | Team lesson notes → drills | Plan to a competition date | On-beat practice/scoring | Stated price |
|---|---|---|---|---|---|---|---|---|---|
| **Ballroom Quest** | Yes (151 figures, 22 dances, 5 styles) | Yes | Yes (3D) | Yes (deterministic checker) | Yes (Coach Marisol) | Yes (Drill Builder) | Yes (Practice Planner) | Yes (rhythm game) | Free to player; AI cost capped at $0.25/session (see tokenomics evidence) |
| Dance Reality (B1) | Part. (waltz; mostly salsa/bachata/hip-hop) | Yes (lead/follow steps) | Yes (AR on your floor) | n.f. | No (VR salsa app has an AI partner) | No | No | Part. (counting voice-over, music) | ? (not stated) |
| BallroomDancers.com (B2) | Yes (1,620+ pattern videos) | Part. (man's/lady's parts on some videos) | No (video) | n.f. | No | No | No | No | $99/yr ($79 renewal) |
| Dance Vision Syllabus (B3) | Yes (6,000+ videos, 13 styles) | Part. (video; follower charts per reviewers) | No (video) | n.f. | No | Part. (team plans, not notes → drills) | Part. (progress charts, goals) | No | $199/yr; free tier |
| STEEZY (B4) | No (no ballroom) | No (solo styles) | Part. (multiple camera angles) | No | No | No | Part. (guided programs) | Part. (tempo control) | $19.99/mo or $99.99/yr |
| Just Dance+ (B5) | No | No | No | No (fixed choreography) | No | No | No | Yes (scored moves) | $4.99/mo, $29.99/yr |
| DanzDB (B6) | Part. (Std + Latin, 200+ figures; no Smooth/Rhythm listed) | n.f. | No | n.f. | No | No (personal notes only) | No | No | Free; $4.99 one-time |
| YouTube tutorials (B8) | Part. (varies) | Part. (varies; usually filmed from the front) | No | No | No | No | No | No | Free |
| Private coach (B9) | Yes | Yes (live) | Yes (in person) | Yes (coach choreographs) | No (human coach, not AI) | Yes (human) | Yes (human) | Yes | $75–$100/hr (Thumbtack) |

**What the table shows (for section 3):**
- Among the products checked, no single one combines three things: the team's own four-style syllabus shown from the dancer's own role in 3D, routines checked against closed-syllabus rules, and AI helpers that work from the team's own lesson notes up to a competition date.
- The closest competitors each cover one part. Dance Reality has footprints and roles. BallroomDancers.com and Dance Vision have large syllabus video libraries. Just Dance has on-beat scoring.
- A private coach covers everything and adds real feedback on your body, but costs $75–$100/hr.
- Ballroom Quest's honest gaps: it does not see the player's body (no camera feedback), it has no professional video demonstrations, its content is checked against one technique book and the team curriculum rather than a professional examiner, and it runs locally only.

---

## E. Could not verify, and what to do with each

| Claim | Status | Use in report? |
|---|---|---|
| YBDT attends 6–8 scored competitions per year (YDN 2012) | SNIPPET, bot checkpoint, 2012 | Only as "a 2012 report said…", or leave it out |
| Which December 2026 competition YBDT attends | UNVERIFIED | Say "a December competition"; do not name one |
| Dance Reality price and last update | UNVERIFIED | Write "price not stated" |
| Choreography Generator app details | SNIPPET | Leave out, or label "discontinued, unverified" |
| Shea et al. 2000 abstract wording | SNIPPET (finding confirmed via the Smith & Scarf review) | Cite through the review |
| Macnamara 2014 percentages | Read on ScienceDaily, not on PubMed | Fine to use; cite the journal plus ScienceDaily |
| National count of collegiate ballroom teams | Not found | Use "37 colleges at the 2026 national championship" |
| Novices can't see instructors' footwork in big lessons | OWN OBSERVATION | Label as Sam's experience until the trial measures it |
