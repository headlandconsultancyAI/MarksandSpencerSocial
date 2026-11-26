"""Keyword taxonomies used to tag posts.

- tag_topic: leader topics (Leadership tab)
- tag_theme: corporate themes (Corporate social tab)
- tag_stories: stories tracked across corporate and brand channels (crossover tab)

Edit the keyword lists here to change how posts are tagged. The next build re-tags every post.
"""
import re

# ---- Leader topics ----
TOPICS = [
 ('Business, results and policy', r"\bresults?\b|half year|half-year|interim|full year|profit|shareholder|investor|strategy|reshap|growth plan|transformation|capital markets|dividend|ftse|market share|cyber|recover|budget|government|policy|policies|\btax|business rates|energy bill|chancellor|economy|article in|minister|parliament|employment rights"),
 ('International', r"international|\buae\b|dubai|india|middle east|overseas|franchise|al-futtaim|global|abroad|ireland|reliance"),
 ('Stores and openings', r"\bstore|opening|opened|\bopen\b|new shop|foodhall|food hall|refurb|renovat|flagship|oxford street|\bsite\b|branch|shop floor|visit(ed|ing)? (the|our)"),
 ('Colleagues and culture', r"colleague|team|apprentice|career|graduate|leadership|people|thank you|proud of|award|recognition|mentor|wellbeing|inclusion|diversity|talent|hiring|recruit|celebrat|retire|welcome"),
 ('Community and charity', r"charity|fundrais|donat|community|volunteer|neighbourly|food bank|foodbank|macmillan|breast cancer|bowel cancer|trustee|sparks gives|homeless|young people|youth|school|marks & start|marks and start|social mobility|neet"),
 ('Fashion and beauty', r"fashion|womenswear|menswear|clothing|clothes|\bdress|denim|knitwear|lingerie|beauty|\bstyle|outfit|wardrobe|\bwear\b|\bcoat|jacket|jumper|skirt|trouser|\bshoes?\b|autograph|jaeger|per una|london fashion week|\blfw\b|catwalk|blazer|trench|satin|#lovethat|love that|@gilliana|gillian anderson|joancollins|katherinejenkins|head to toe|🧥|marksandspencerstyle|marksandspencerman|product code|collection|goodmove|sportswear|activewear|leisurewear|\bshirt|\bski\b|aries|sweaty betty|british fashion council|\bT\d{6}"),
 ('Food and product', r"food|cookie|chocolate|product|launch|recipe|taste|cheese|bakery|sandwich|meal|dine in|percy pig|pasta|ingredient|grape|cherr|tomato|beans|picky bits|snack|cake|wine|fresh|range|lines|flavour|dessert|christmas|turkey|supplier|farmer|farm"),
]
def tag_topic(text):
    t=text.lower(); scores={}
    for name,rx in TOPICS:
        n=len(re.findall(rx,t))
        if n: scores[name]=n
    if not scores: return 'No clear topic' if t.strip() else 'No caption'
    return max(scores,key=lambda k:(scores[k],-[x[0] for x in TOPICS].index(k)))

# ---- Corporate themes ----
# Corporate themes. A post naming an MP, MSP, MLA or minister goes to Public affairs outright.
# Otherwise each theme scores its keyword hits (some phrases count double) and the top score wins.
OVERRIDE = r"\b(mps?|msps?|mlas?)\b|@\w+mp\b|minister\b|member of parliament"
THEMES = [
 ('Campaigns and famous faces', [(r"christmas ad|\bad has landed|\bour (new )?ad\b|campaign film|starring|gillian anderson|chief compliments|georgia may jagger|james nelson-joyce|new face of|fronted by|james norton|lucy punch|\bcelebrit",2)]),
 ('Public affairs', [(r"parliament|house of lords|house of commons|westminster|holyrood|\bmayor\b|government|policy|business rates|select committee",1)]),
 ('Results and growth', [(r"\bresults?\b|half year|half-year|full year|interim|trading|record[- ]breaking|market share|profit|shareholder|investor|annual report|esg report|strategy|international|australia|\bcoles\b|zalora|the iconic|nordstrom|global|\buae\b|al-futtaim|india|franchise|greece|athens|sparks",1)]),
 ('Stores and investment', [(r"\bstores?\b|foodhall|food hall|flagship|sq ft|\bjobs\b|invest\w*|store manager|drone|glow-up|step inside|bigger",0.7),
                            (r"now open|we.re open|\bopen(ed|ing)\b|reopen\w*|is open|officially open|brand[- ]new (m&s )?(food )?(store|foodhall)|renewed|refurbish|transformed .{0,20}store",2)]),
 ('Value and prices', [(r"trusted value|\bvalue\b|remarksable|remarkable value|price|£\d+(\.\d+)? to £|lowering|cheaper|afford|holding our|shopping.list",1)]),
 ('Food quality and innovation', [(r"\bfood\b|product develop|taste|recipe|range|bakery|cookie|chocolate|cheese|meal|ice cream|frozen|christmas dinner|mince pie|percy pig|colin|sandwich|wine|flavour|steak|pasta|italian|lamington|sprouts|salad|dessert|snack|treat|tasting|quality upgrades|chef|pet food|paws",1)]),
 ('Health and nutrition', [(r"fibre|nutrition|nutrient|better with beans|bowel cancer|healthy|\bhealth\b|wellness|protein|\bbeans\b",1.5)]),
 ('Fashion, home and beauty', [(r"fashion|womenswear|menswear|kidswear|lingerie|\bbras?\b|beauty|fragrance|skincare|\bstyle|collection|autograph|knitwear|jumper|cashmere|denim|\bdress|coat|boots|partywear|separates|catwalk|\blfw\b|\bhome\b|homeware|kelly hoppen|bella freud|16arlington|hugo boss|tiktok shop|gillian anderson|\bwear\b|outfit|archive|per una|goodmove",1)]),
 ('Farming and sustainability', [(r"farm\w*|plan a\b|sustainab\w*|regenerative|biodiversity|net zero|renewable|circular|textile waste|resale|recycl|wildfarmed|fairtrade|supplier|grower|select farm|food waste|surplus|too good to go|vertically|pesticide|carbon|another life|re:spark|animal welfare|crustacean|compassion",1)]),
 ('Colleagues and careers', [(r"colleague|career|graduate|apprentice|early careers|marks ?& ?start|marks and start|programme|hiring|recruit|my duvet flip|audit team|people officer|city & guilds|carer confident|name badge|team manager",1),
                             (r"years (of service|with m&s|at m&s)|\d+ years (at|with)|christmases with|hidden heroes?|long[- ]service|milestone|like father",2)]),
 ('Community and charity', [(r"charity|fundrais|raised|donat|community|volunteer|neighbourly|food insecurity|food bank|youngminds|young minds|hello ?yellow|mental health|breast cancer|macmillan|king.s trust|oxfam|\bmiles\b|awareness (week|month)",1)]),
]
NAMES=[t[0] for t in THEMES]
def tag_theme(text):
    t=(text or '').lower()
    if not t.strip(): return 'No caption'
    if re.search(OVERRIDE,t): return 'Public affairs'
    sc={}
    for name,rules in THEMES:
        s=sum(w*len(re.findall(rx,t)) for rx,w in rules)
        if s: sc[name]=s
    if not sc: return 'Other'
    return max(sc,key=lambda k:(sc[k],-NAMES.index(k)))

# ---- Stories ----
# Stories that the corporate channels tell, matched in any post's text. A post can carry several.
# Brand and product stories (Sparks, Picky Bits, Percy Pig and Colin, Christmas food) were taken out
# on 26 Nov 2026, so the list only holds corporate stories.
STORIES = [
 ('Christmas ad', r"christmas ad|mrs claus|james norton|lucy punch|heaven is a place on earth"),
 ('Gillian Anderson', r"gillian anderson|chief compliments"),
 ('Nutrient Dense and fibre', r"nutrient dense|fibre|better with beans"),
 ('Remarksable value and prices', r"remarksable|remarkable value|trusted value|lowering prices|price drop|holding our .{0,30}prices"),
 ('Plan A, farming and Fairtrade', r"plan a\b|planaforfarming|select farm|fairtrade|ben fogle|regenerative|wildfarmed"),
 ('Store openings', r"now open|we.re open|officially open|re-?opened|brand[- ]new (m&s )?(food )?(store|foodhall)|flagship"),
 ('100 years of fashion', r"100 years (of|in) fashion|100yearsoffashion|london fashion week|\blfw\b|catwalk"),
 # "the iconic" on its own is left out: it matched everyday phrases like "the iconic sandwich".
 ('Australia and international', r"australia|\bcoles\b|nordstrom|zalora|theiconic|al-futtaim|\buae\b"),
 ('Marks & Start and careers', r"marks ?& ?start|marks and start|early careers|graduate|careers? at m&s|notjustanyjob"),
 ('YoungMinds', r"youngminds|young minds|hello ?yellow"),
 ('Food waste partnerships', r"neighbourly|too good to go|food waste|surplus food"),
 ('Results and trading', r"half year results|full year results|trading (update|statement|results)|our results|christmas trading"),
 ('MP and MSP visits', r"\b(mps?|msps?|mlas?)\b|@\w+mp\b|minister\b"),
 ('Football', r"lioness|england (football|team|squad)|scotland national|world cup|euros\b|\bfootball\b"),
 ('Breast Cancer Now', r"breast cancer"),
]
STORY_NAMES = {n for n, _ in STORIES}

# Wording that looks like a story but isn't, removed from the text before that story is matched.
STORY_EXCLUDE = {
 # Ordering windows and seasonal shops "opening" aren't new stores.
 'Store openings': r"(food to order|to order|christmas shop|pre-?orders?|bookings?|entries|applications?|voting|the sale|pop-?up)\W+(is |are )?(now |officially )?(now |officially )?open",
}


def tag_stories(text):
    t = (text or '').lower()
    out = []
    for n, rx in STORIES:
        s = re.sub(STORY_EXCLUDE[n], ' ', t) if n in STORY_EXCLUDE else t
        if re.search(rx, s):
            out.append(n)
    return '|'.join(out)
