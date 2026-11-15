/**
 * General Canadian personal-finance tips that Tick the mascot says on loading screens and when clicked.
 * They stick to rules that rarely change. Yearly dollar limits are left out so the list doesn't go stale.
 * These are general information, not personal financial advice.
 */
export const TIPS: readonly string[] = [
  // TFSA
  'TFSA room you don\'t use carries forward forever. Missed a year? You can still catch up.',
  'Taking money out of your TFSA? You get that room back on January 1 of the next year, not right away.',
  'Putting withdrawn money back into your TFSA in the same year can mean an over-contribution, which costs 1% a month.',
  'Your TFSA can hold stocks, ETFs, GICs and bonds, not just cash. A "savings account" TFSA is only one option.',
  'Growth and withdrawals in a TFSA are tax-free, and they don\'t count as income for benefits like OAS or the GST/HST credit.',
  'You start getting TFSA room the year you turn 18, as long as you\'re a Canadian resident with a SIN.',
  'Check your exact TFSA room in CRA My Account. Bank records don\'t always match what the CRA sees.',
  'Frequent day trading inside a TFSA can lead the CRA to tax it as business income. Treat it as long-term savings.',
  'Name a successor holder or beneficiary on your TFSA so it can pass on smoothly.',
  'A TFSA is a good home for an emergency fund. It grows tax-free and you can still get at it.',

  // RRSP
  'RRSP contributions lower your taxable income, which can mean a bigger refund.',
  'Contributions in the first 60 days of the year can count toward last year\'s RRSP deduction.',
  'Your RRSP room is 18% of last year\'s earned income, up to the yearly max. Your Notice of Assessment shows the number.',
  'An RRSP works best if you\'re in a higher tax bracket now than you expect to be in retirement.',
  'You don\'t have to claim an RRSP deduction the year you contribute. You can save it for a higher-income year.',
  'A spousal RRSP can split retirement income between partners and lower your combined tax.',
  'The Home Buyers\' Plan lets first-time buyers borrow from their RRSP for a home and repay it over 15 years.',
  'The Lifelong Learning Plan lets you take RRSP money tax-free to pay for full-time education.',
  'Money taken out of an RRSP early is taxed as income, and that RRSP room is gone for good.',
  'Your RRSP must become a RRIF or annuity by the end of the year you turn 71.',
  'You can go up to $2,000 over your RRSP limit without a penalty, but that extra isn\'t deductible.',
  'Got a raise? Sending part of it straight to your RRSP helps you save without missing it.',
  'US dividend stocks are often better in an RRSP than a TFSA because the tax treaty can waive the 15% withholding.',

  // FHSA
  'An FHSA gives you a tax deduction going in and tax-free money coming out for a first home. That\'s the best of an RRSP and a TFSA.',
  'You can put up to $8,000 a year into an FHSA, with a $40,000 lifetime limit.',
  'Up to $8,000 of unused FHSA room carries forward a year, but room only starts once you open the account.',
  'Thinking of buying a home someday? Open an FHSA early so the contribution room starts adding up.',
  'If you never buy a home, FHSA money can move to your RRSP tax-free without using RRSP room.',
  'You can use the FHSA and the Home Buyers\' Plan together for the same first home.',

  // RESP and family
  'The Canada Education Savings Grant adds 20% to RESP contributions, up to $500 a year per child.',
  'Each child can get up to $7,200 in lifetime CESG grants. Starting early helps you collect all of it.',
  'Lower-income families may get the Canada Learning Bond in an RESP without putting in any money.',
  'RESP growth is taxed in the student\'s hands later, usually at little or no tax.',
  'The Canada Child Benefit is tax-free. File your taxes every year to keep getting it.',
  'Child care costs like daycare and day camps can often be deducted, usually by the lower-income parent.',

  // CPP and OAS
  'You can start CPP anytime from 60 to 70. Each month you wait past 65 adds 0.7% to your pension.',
  'Starting CPP before 65 cuts your payment by 0.6% for each month early.',
  'Putting off OAS past 65 adds 0.6% a month, up to 36% more at 70.',
  'High-income retirees may have to pay back part of their OAS. Planning withdrawals can help avoid it.',
  'Check your CPP Statement of Contributions in My Service Canada Account to see what you\'ve earned.',
  'Couples can share CPP pensions to even out their income and possibly pay less tax.',
  'The Guaranteed Income Supplement helps low-income seniors. It isn\'t automatic for everyone, so check.',

  // Your pay stub
  'Check every pay stub. CPP, EI and income tax should all be there and look about right.',
  'Once you hit the yearly CPP and EI maximums, those deductions stop and your take-home pay goes up for the rest of the year.',
  'Fill out your TD1 forms carefully. They decide how much tax comes off each paycheque.',
  'A big refund every spring means too much tax came off your pay. A form T1213 can lower it.',
  'Owe tax every year? Ask payroll to take a bit more off each cheque so April doesn\'t hurt.',
  'Overtime is taxed like regular pay. It only feels higher because of the bracket it lands in on that cheque.',
  'Vacation pay is earned on your wages, and in most provinces it starts at 4%.',
  'Your T4 should match your last pay stub of the year. Report any mismatch to payroll early.',
  'Employer RRSP or pension matching is free money. Contribute at least enough to get the full match.',
  'Keep your pay stubs. They\'re proof of income for mortgages, rentals and EI claims.',

  // Taxes
  'Most people must file their taxes by April 30. Self-employed people have until June 15, but any balance owing is still due April 30.',
  'Even with little or no income, file a return. It unlocks the GST/HST credit and other benefits.',
  'Filing late when you owe means a penalty of 5% plus 1% a month. File on time even if you can\'t pay yet.',
  'Keep tax receipts and records for at least six years in case the CRA asks.',
  'You can claim medical expenses for any 12-month period that ends in the tax year. Pick the one that gives you the most.',
  'Couples can combine medical expenses on one return, usually the lower-income partner\'s.',
  'Charitable donations get a bigger credit once you\'re past $200. Partners can pool them on one return.',
  'Moved at least 40 km closer to a new job or school? Your moving costs may be deductible.',
  'Union and professional dues are tax-deductible. They\'re often listed right on your T4.',
  'Working from home? You may be able to deduct some home office costs with a T2200 from your employer.',
  'The Canada Workers Benefit puts money back in the pockets of low-income workers. Filing is how you claim it.',
  'Students can carry forward unused tuition credits or transfer some to a parent or partner.',
  'Sign up for CRA direct deposit. Refunds and benefits arrive faster than by cheque.',
  'Capital gains are only partly taxed, so investment growth can be more tax-friendly than interest.',
  'Selling an investment at a loss can offset capital gains this year, the last three years or any future year.',
  'Interest from savings accounts and GICs outside registered accounts is fully taxed. Hold them in a TFSA when you can.',
  'Pension income splitting lets eligible couples move up to half of a qualifying pension to the lower-income partner.',

  // Budgeting and saving
  'Pay yourself first. Set up an automatic transfer to savings on payday.',
  'Try to keep an emergency fund of 3 to 6 months of expenses.',
  'A simple budget to start with: about 50% needs, 30% wants and 20% savings and debt. Adjust it to fit you.',
  'Look through your subscriptions every few months. Small monthly charges add up fast.',
  'Wait 24 hours before buying anything big. It cuts down a lot of impulse spending.',
  'Saving for something specific, like a trip or a car? Give it its own savings account.',
  'High-interest savings accounts from online banks often pay much more than big-bank accounts.',
  'GICs lock in a guaranteed rate. Spreading them across different end dates keeps some money available every year.',
  'Little expenses become big ones over a year. $6 a day is more than $2,000.',
  'Inflation eats away at cash. Money for goals more than five years away usually needs to be invested.',

  // Debt and credit
  'Pay your credit card in full each month to avoid interest that often runs about 20% or more.',
  'Try to use less than 30% of your credit limit. It helps your credit score.',
  'Equifax and TransUnion give Canadians a free credit report. Check yours yearly for errors.',
  'Paying on time is the biggest factor in your credit score. Set up automatic minimum payments as a backstop.',
  'Closing your oldest credit card can shorten your credit history and lower your score.',
  'Paying off high-interest debt is a guaranteed return as good as its interest rate.',
  'Carrying several debts? Pay the highest rate first (avalanche) or the smallest balance first (snowball). Both work if you keep at it.',
  'Payday loans can cost hundreds of percent a year. A credit union loan or overdraft is usually far cheaper.',
  'Repaying federal student loans early saves on interest, and some provinces charge no interest at all.',

  // Banking, housing and protection
  'CDIC protects eligible deposits up to $100,000 per category at each member bank.',
  'Keep your mortgage payments to about 30% of your gross income or less, including property tax and heat.',
  'Before your mortgage renews, compare offers from other lenders. Don\'t just sign the renewal letter.',
  'Even small extra mortgage payments can cut years off your amortization.',
  'Tenant insurance is usually cheap and covers your belongings and liability. Many landlords require it.',
  'If anyone relies on your income, term life insurance is usually the most affordable way to protect them.',
  'Check whether your workplace benefits include disability insurance. Losing your income is a bigger risk than most people think.',
  'Low-fee index ETFs can save you thousands compared with high-fee mutual funds over the years.',
  'The CRA will never ask for payment in gift cards or crypto. Hang up and call them back on the official number.',
  'Make a will and name beneficiaries on your registered accounts. It makes things much easier for your family.',
  'Set up a power of attorney for property so someone you trust can handle your money if you can\'t.',
  'Review your finances once a year: net worth, contribution room, insurance and beneficiaries. January is a good time.',
]

/** Random tip index, optionally avoiding the one just shown. */
export function randomTipIndex(avoid?: number) {
  if (TIPS.length < 2) return 0
  let i = Math.floor(Math.random() * TIPS.length)
  if (i === avoid) i = (i + 1) % TIPS.length
  return i
}
