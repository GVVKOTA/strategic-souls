Strategic Souls (SS)
Research into evidence.
Strategic Souls is a financial-market research and strategy platform being developed by Global Vertex Vectors (GVV). Our goal is to make professional-quality market intelligence, customizable research tools, and collaborative analysis more accessible to independent investors and market researchers.
Project status: Active development (X2). This README describes the product direction and intended workflows, not a verified list of live features. Real market data, scanning, backtesting, accounts, and collaboration depend on the implemented services, data permissions, and testing.
At a glance


Product
Strategic Souls (SS)
Developer
Global Vertex Vectors (GVV)
Focus
Financial research, custom market scanning, evidence-based strategy analysis, and collaboration
Markets in scope
NSE, BSE, MCX, and major global indices
Core workspaces
Global · Strategy · Community
Stage
Private repository · X2 under development
Our mission and vision
Mission: Make powerful, transparent financial research easier to use, understand, and afford—from beginners to experienced market researchers.
Vision: Build a daily-use financial intelligence ecosystem where users can discover market opportunities, test their own ideas against credible data, study historical evidence, and collaborate with others—all in one connected workspace.
How the platform is designed to work
Strategic Souls is organized around three connected workspaces rather than a collection of unrelated tools.
🌐 1. Global — Understand the markets
The Global workspace is designed to help users monitor and explore:
Indian markets: NSE and BSE instruments, alongside MCX commodities.
International markets: Major global stock indices for broader context.
Market research: Asset detail pages, charts, watchlists, and portfolio views.
Data transparency: Source and timestamp labels that distinguish live, delayed, end-of-day, historical, and unavailable information.
Purpose: Understand what is happening in the market before forming a trading or investing hypothesis.
🧠 2. Strategy — Turn an idea into a Soul
The Strategy workspace centers on Soul Scan, a research tool for defining and evaluating personalized market conditions.
Intended Soul Scan workflow:
Select a market: Choose instruments, coverage, and timeframe.
Name your Soul: Give the scan a name and describe the hypothesis it tests.
Build rules: Use a simple visual builder or advanced formulas and supported technical/fundamental metrics.
Verify inputs: Check data availability, sources, and limitations before execution.
Run and inspect: Review matches, supporting evidence, exclusions, and unavailable results.
Learn and improve: Save versions, revisit Scan History, and study past ideas in the Graveyard.
Related planned tools include Market Radar, Formula Lab, asset comparisons, chart analysis, and contextual backtesting.
Purpose: Make strategies systematic, repeatable, and reviewable—not treat scanner results as guaranteed signals.
👥 3. Community — Research together
The Community workspace is intended to support shared financial research through:
Body profiles: Research identities and discoverable user profiles.
Research groups: Collaborative discussions and shared investigations.
Messaging and discovery: Find other researchers and exchange insights.
Shared Souls: Share strategy versions and findings with appropriate permissions.
Posts and engagement: Discuss ideas, record observations, and learn from others.
Purpose: Build a community where people can challenge assumptions and improve the quality of their research. Collaboration features require verified accounts, access controls, and moderation before launch.
The Strategic Souls research cycle
GLOBAL                 STRATEGY                      COMMUNITY
Explore markets  -->   Build a Soul  --> Review --> Share research
      ^                    |                             |
      +------ Refine your hypothesis <--- Discuss findings +
In practice: Explore → Define → Scan → Review → Collaborate → Improve.
Repository structure
The following top-level paths are visible in the current repository. Their exact runtime roles and interactions should be confirmed against the source before publishing developer documentation.
strategic-souls/
├── .github/workflows/   # GitHub automation workflows
├── .openai/             # OpenAI-related project configuration
├── app/                 # Application source
├── backend/             # Backend-related source
├── database/            # Database-related source
├── drizzle/             # Drizzle-related files
├── frontend/            # Frontend-related source
├── operations/          # Operational tooling and documentation
├── public/              # Public/static assets
├── scripts/             # Development and maintenance scripts
├── supabase/            # Supabase-related configuration
├── tests/               # Tests
├── README.md            # Main project documentation
├── package.json         # Package metadata and scripts
└── pnpm-workspace.yaml  # Workspace configuration
Development tools visible in the repository: TypeScript, Next.js and Vite configuration files, pnpm, Drizzle, Supabase-related files, and GitHub Actions. Their exact use, deployment roles, and working status have not been independently audited.
Getting started (developers)
This is a private work-in-progress repository. Before running the project:
Clone the repository using your authorized GitHub access.
Open the project directory in VS Code or another editor.
Read package.json and pnpm-workspace.yaml to identify the correct workspace and available scripts.
Check .env.example for the names of required configuration variables; obtain actual values securely from the project owner.
Install dependencies with the package manager and version specified by the project.
Run the appropriate documented development and test scripts after confirming them from package.json.
Setup not yet verified: Exact install, start, migration, and test commands should be added only after checking the current source and confirming that they work. Never commit secrets, service keys, or a populated .env file.
Development priorities
[ ]
Verify full local setup, service dependencies, and repeatable startup instructions.
[ ]
Validate authorized data coverage for NSE, BSE, MCX, and major world indices.
[ ]
Complete and test Soul Scan's simple/advanced builders and evidence-based results.
[ ]
Verify charting, asset data, formulas, and historical analysis.
[ ]
Complete and security-test Body profiles, groups, and research sharing.
[ ]
Verify mobile experience, accessibility, error handling, and deployment.
These are development priorities, not a statement that the corresponding features are absent or completed. Completion should be updated only from code, test, and deployment evidence.
Product principles
Evidence over hype: No fabricated quotes, statistics, probabilities, or backtest outcomes.
Data freshness matters: Clearly identify what is live, delayed, historical, or unavailable.
Transparency by design: Explain inputs, assumptions, uncertainties, and exclusions.
Easy to start, powerful to explore: Beginner-friendly flows with deeper advanced controls.
Secure collaboration: Protect accounts, research permissions, and private credentials.
Research, not trade execution: No broker order placement or promise of returns.
Long-term business direction
Strategic Souls aims to offer a sustainable free + premium experience: accessible essential research tools for free users, potentially supported by advertising, with more advanced features available through affordable subscriptions. Prices, entitlements, and release dates are not yet finalized.
Important disclaimer
Strategic Souls is intended for education and financial research. It is not a broker, does not execute trades, and does not guarantee investment outcomes. Market data may be delayed, incomplete, unavailable, or subject to licensing restrictions. Research output and historical simulations are not personalized investment advice.
Strategic Souls · Global Vertex Vectors (GVV)
Analyze with evidence. Build with purpose.
