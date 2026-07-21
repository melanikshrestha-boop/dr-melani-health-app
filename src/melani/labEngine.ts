/**
 * Smart lab import + merge.
 * - Drop / paste lab text, CSV, or JSON
 * - Categorize into sections (creates new sections when needed)
 * - Updates same test with new value + OK/HIGH/LOW
 * - Keeps thorough explanations when known; generates solid defaults when new
 */
import {
  LAB_ITEMS as SEED_LABS,
  LAB_SECTIONS as BASE_SECTIONS,
  type LabItem,
  type LabSectionDef,
  type LabStatus,
  formatLabDate,
  sectionStatus,
} from "./labData";

const STORE_KEY = "dr-melani-labs-v1";
export type BuiltSection = LabSectionDef & {
  items: LabItem[];
  status: LabStatus;
  date: string;
};

// ── Reference ranges for smart status (common adult female–leaning when sex-specific) ──
type Ref = {
  low?: number;
  high?: number;
  unit?: string;
  normalRange: string;
  oneLiner: string;
  simple: string;
  testsFor: string;
  highMeans: string;
  lowMeans: string;
  section: string;
  short: string;
};

const KNOWN: Record<string, Ref> = {
  "ldl cholesterol": {
    high: 110,
    unit: "mg/dL",
    normalRange: "Goal often under 110 mg/dL",
    oneLiner: "Can build up in artery walls.",
    simple:
      "LDL carries cholesterol in blood. Too much can form plaque in arteries over years — the main trackable “bad cholesterol.”",
    testsFor: "Long-term heart and artery risk.",
    highMeans: "Higher plaque risk — diet, activity, and follow-up matter.",
    lowMeans: "Generally protective for heart health.",
    section: "cholesterol",
    short: "LDL",
  },
  ldl: {
    high: 110,
    unit: "mg/dL",
    normalRange: "Goal often under 110 mg/dL",
    oneLiner: "Can build up in artery walls.",
    simple:
      "LDL carries cholesterol in blood. Too much can form plaque in arteries over years.",
    testsFor: "Long-term heart and artery risk.",
    highMeans: "Higher plaque risk.",
    lowMeans: "Generally good for heart health.",
    section: "cholesterol",
    short: "LDL",
  },
  "hdl cholesterol": {
    low: 45,
    unit: "mg/dL",
    normalRange: "Often goal above ~45–50 mg/dL (women)",
    oneLiner: "Helps clear cholesterol from tissues.",
    simple:
      "HDL helps reverse-transport cholesterol back to the liver. Higher is often linked with lower heart risk.",
    testsFor: "Reverse cholesterol transport capacity.",
    highMeans: "Often protective.",
    lowMeans: "Less cleanup capacity — exercise helps raise it.",
    section: "cholesterol",
    short: "HDL",
  },
  hdl: {
    low: 45,
    unit: "mg/dL",
    normalRange: "Often goal above ~45–50 mg/dL",
    oneLiner: "Helps clear cholesterol from tissues.",
    simple: "HDL helps reverse-transport cholesterol back to the liver.",
    testsFor: "Reverse cholesterol transport.",
    highMeans: "Often protective.",
    lowMeans: "Exercise and not smoking help raise HDL.",
    section: "cholesterol",
    short: "HDL",
  },
  triglycerides: {
    high: 100,
    unit: "mg/dL",
    normalRange: "Often goal under ~90–150 mg/dL fasting",
    oneLiner: "Blood fat from sugar and leftover calories.",
    simple:
      "Triglycerides store and move fat energy. High levels often track with sugar intake, alcohol, and insulin resistance.",
    testsFor: "Metabolic and heart risk with lipids.",
    highMeans: "Cut liquid sugar, refine carbs, train more.",
    lowMeans: "Usually healthy.",
    section: "cholesterol",
    short: "TG",
  },
  "total cholesterol": {
    high: 170,
    unit: "mg/dL",
    normalRange: "Often goal under ~170 mg/dL for prevention",
    oneLiner: "Sum of cholesterol in your blood.",
    simple: "Adds LDL + HDL + other lipoproteins into one snapshot.",
    testsFor: "Overall cholesterol load.",
    highMeans: "Usually means more lipids than ideal — check LDL/HDL split.",
    lowMeans: "Usually fine.",
    section: "cholesterol",
    short: "TC",
  },
  "non-hdl cholesterol": {
    high: 120,
    unit: "mg/dL",
    normalRange: "Often goal under ~120 mg/dL",
    oneLiner: "All plaque-promoting cholesterol (not just LDL).",
    simple: "Total cholesterol minus HDL — all atherogenic particles.",
    testsFor: "Fuller heart-risk cholesterol picture.",
    highMeans: "Raised risky cholesterol pool.",
    lowMeans: "Better for arteries.",
    section: "cholesterol",
    short: "Non-HDL",
  },
  "chol/hdl ratio": {
    high: 5,
    unit: "ratio",
    normalRange: "Often goal under ~5.0 (lower better)",
    oneLiner: "Balance of total cholesterol to HDL.",
    simple: "Total cholesterol ÷ HDL. Lower is better.",
    testsFor: "Rough lipid risk balance.",
    highMeans: "Less favorable balance.",
    lowMeans: "More favorable balance.",
    section: "cholesterol",
    short: "Chol/HDL",
  },
  glucose: {
    low: 70,
    high: 99,
    unit: "mg/dL",
    normalRange: "About 70–99 mg/dL fasting",
    oneLiner: "Blood sugar fuel for brain and body.",
    simple:
      "Glucose is main blood sugar. Fasting value shows baseline sugar handling.",
    testsFor: "Diabetes / insulin resistance screening.",
    highMeans: "Possible insulin resistance if fasting and repeated.",
    lowMeans: "Hypoglycemia risk if truly low.",
    section: "blood_sugar",
    short: "Glucose",
  },
  "hemoglobin a1c": {
    high: 5.7,
    unit: "%",
    normalRange: "Under 5.7% typical normal",
    oneLiner: "3-month average blood sugar.",
    simple:
      "Sugar sticks to hemoglobin; A1c averages sugar over ~3 months.",
    testsFor: "Long-term sugar control; prediabetes screen.",
    highMeans: "5.7–6.4% prediabetes range; 6.5%+ diabetes range.",
    lowMeans: "Usually fine when not on sugar-lowering meds.",
    section: "blood_sugar",
    short: "A1c",
  },
  a1c: {
    high: 5.7,
    unit: "%",
    normalRange: "Under 5.7% typical normal",
    oneLiner: "3-month average blood sugar.",
    simple: "A1c averages blood sugar over ~3 months.",
    testsFor: "Long-term sugar control.",
    highMeans: "Prediabetes or diabetes range if elevated.",
    lowMeans: "Usually fine.",
    section: "blood_sugar",
    short: "A1c",
  },
  hba1c: {
    high: 5.7,
    unit: "%",
    normalRange: "Under 5.7% typical normal",
    oneLiner: "3-month average blood sugar.",
    simple: "A1c averages blood sugar over ~3 months.",
    testsFor: "Long-term sugar control.",
    highMeans: "Prediabetes or diabetes range if elevated.",
    lowMeans: "Usually fine.",
    section: "blood_sugar",
    short: "A1c",
  },
  wbc: {
    low: 4.1,
    high: 10.9,
    unit: "10^3/uL",
    normalRange: "About 4.1–10.9 ×10³/µL",
    oneLiner: "Immune cells fighting infection.",
    simple: "White blood cells are your immune army.",
    testsFor: "Infection, inflammation, marrow stress.",
    highMeans: "Infection, stress, steroids, inflammation.",
    lowMeans: "Viral recovery or reduced production.",
    section: "blood_cells",
    short: "WBC",
  },
  rbc: {
    low: 3.8,
    high: 5.2,
    unit: "10^6/uL",
    normalRange: "About 3.8–5.2 ×10⁶/µL (many young women)",
    oneLiner: "Oxygen-carrying red cells.",
    simple: "Red cells deliver oxygen with hemoglobin.",
    testsFor: "Anemia or concentration of blood.",
    highMeans: "Dehydration or polycythemia patterns.",
    lowMeans: "Anemia — fatigue, pale skin.",
    section: "blood_cells",
    short: "RBC",
  },
  hgb: {
    low: 11.7,
    high: 15.7,
    unit: "g/dL",
    normalRange: "About 11.7–15.7 g/dL (female)",
    oneLiner: "Oxygen-carrying protein in red cells.",
    simple: "Hemoglobin binds oxygen in red cells.",
    testsFor: "Core anemia number.",
    highMeans: "Thick blood or dehydration.",
    lowMeans: "Anemia — often iron loss with periods.",
    section: "blood_cells",
    short: "HGB",
  },
  hemoglobin: {
    low: 11.7,
    high: 15.7,
    unit: "g/dL",
    normalRange: "About 11.7–15.7 g/dL (female)",
    oneLiner: "Oxygen-carrying protein in red cells.",
    simple: "Hemoglobin binds oxygen in red cells.",
    testsFor: "Core anemia number.",
    highMeans: "Thick blood or dehydration.",
    lowMeans: "Anemia — often iron loss with periods.",
    section: "blood_cells",
    short: "HGB",
  },
  hct: {
    low: 34.9,
    high: 46.9,
    unit: "%",
    normalRange: "About 34.9–46.9%",
    oneLiner: "Percent of blood that is red cells.",
    simple: "Hematocrit is how crowded blood is with red cells.",
    testsFor: "Anemia vs dehydration.",
    highMeans: "Often dehydration.",
    lowMeans: "Tracks with anemia.",
    section: "blood_cells",
    short: "HCT",
  },
  plt: {
    low: 150,
    high: 400,
    unit: "10^3/uL",
    normalRange: "About 150–400 ×10³/µL",
    oneLiner: "Clotting cell fragments.",
    simple: "Platelets plug vessel tears and start clots.",
    testsFor: "Bleeding and clotting risk.",
    highMeans: "Inflammation or marrow push.",
    lowMeans: "Easier bruising if truly low.",
    section: "blood_cells",
    short: "PLT",
  },
  platelets: {
    low: 150,
    high: 400,
    unit: "10^3/uL",
    normalRange: "About 150–400 ×10³/µL",
    oneLiner: "Clotting cell fragments.",
    simple: "Platelets plug vessel tears and start clots.",
    testsFor: "Bleeding and clotting risk.",
    highMeans: "Inflammation or marrow push.",
    lowMeans: "Easier bruising if truly low.",
    section: "blood_cells",
    short: "PLT",
  },
  alt: {
    high: 35,
    unit: "U/L",
    normalRange: "About 0–35 U/L (female; labs vary)",
    oneLiner: "Liver cell enzyme — rises when cells leak.",
    simple: "ALT spills into blood when liver cells are stressed.",
    testsFor: "Liver cell injury.",
    highMeans: "Fatty liver, meds, alcohol, viruses, hard training.",
    lowMeans: "Usually fine.",
    section: "liver",
    short: "ALT",
  },
  ast: {
    high: 32,
    unit: "U/L",
    normalRange: "About 0–32 U/L (female; labs vary)",
    oneLiner: "Liver/muscle enzyme.",
    simple: "AST rises with liver or muscle injury.",
    testsFor: "Liver or muscle cell injury.",
    highMeans: "Liver stress or intense exercise.",
    lowMeans: "Usually fine.",
    section: "liver",
    short: "AST",
  },
  alp: {
    low: 35,
    high: 105,
    unit: "U/L",
    normalRange: "About 35–105 U/L",
    oneLiner: "Bile duct and bone enzyme.",
    simple: "ALP comes from bile ducts and bone turnover.",
    testsFor: "Bile flow and bone activity.",
    highMeans: "Bile stress or bone growth.",
    lowMeans: "Usually not urgent.",
    section: "liver",
    short: "ALP",
  },
  albumin: {
    low: 3.5,
    high: 5.2,
    unit: "g/dL",
    normalRange: "About 3.5–5.2 g/dL",
    oneLiner: "Main blood protein from the liver.",
    simple: "Albumin keeps fluid in vessels and carries hormones/drugs.",
    testsFor: "Liver synthesis, nutrition, kidney protein loss.",
    highMeans: "Often dehydration.",
    lowMeans: "Liver, kidney leak, or low protein intake.",
    section: "liver",
    short: "Albumin",
  },
  bilirubin: {
    low: 0,
    high: 1.0,
    unit: "mg/dL",
    normalRange: "About 0.0–1.0 mg/dL",
    oneLiner:
      "Yellow pigment made when hemoglobin from old red blood cells is broken down.",
    simple:
      "Bilirubin is a yellow chemical pigment. When red blood cells finish their ~120-day life, hemoglobin is split: iron is recycled, and the heme ring is converted into unconjugated (indirect) bilirubin. That form is not water-soluble, so it rides on albumin in the blood to the liver. Liver cells then conjugate it (attach glucuronic acid), making conjugated (direct) bilirubin water-soluble so it can enter bile, leave through the intestines, and leave the body in stool (that brown color is partly from bilirubin breakdown products). A little is also cleared by the kidneys in urine. “Total bilirubin” on a standard lab is the sum of unconjugated + conjugated. It is not a toxin score by itself; it is a checkpoint on the pipeline: red-cell turnover → blood transport → liver processing → bile exit. If any step speeds up (more cells dying) or bottlenecks (liver injury, bile duct blockage, enzyme quirks like Gilbert’s), total bilirubin can rise and, if high enough, skin or eyes can look yellow (jaundice).",
    testsFor:
      "Whether the heme-to-bile disposal path is working: red-cell breakdown rate, liver conjugation, and bile flow. Often read with ALT, AST, ALP, and sometimes direct/indirect split.",
    highMeans:
      "Too much production (hemolysis / more red-cell breakdown), slower liver conjugation, blocked bile flow, or a mix. Mild isolated bumps can be benign (e.g. Gilbert’s, fasting). Rising bilirubin with high ALT/AST or ALP, dark urine, pale stools, itching, or true jaundice needs a clinician.",
    lowMeans: "Usually not a problem. Labs rarely chase low total bilirubin alone.",
    section: "liver",
    short: "Bili",
  },
  creatinine: {
    low: 0.51,
    high: 0.95,
    unit: "mg/dL",
    normalRange: "About 0.51–0.95 mg/dL (young female range)",
    oneLiner: "Muscle waste filtered by kidneys.",
    simple: "Kidneys clear creatinine; level rises if filtration falls.",
    testsFor: "Kidney filtration (with eGFR).",
    highMeans: "Reduced filtration, dehydration, or high muscle mass.",
    lowMeans: "Often low muscle mass — not automatically bad kidneys.",
    section: "kidney",
    short: "Creatinine",
  },
  bun: {
    low: 6,
    high: 20,
    unit: "mg/dL",
    normalRange: "About 6–20 mg/dL",
    oneLiner: "Protein waste handled by liver and kidneys.",
    simple: "BUN rises with dehydration or reduced kidney flow.",
    testsFor: "Hydration and kidney perfusion.",
    highMeans: "Dehydration is a common cause.",
    lowMeans: "Low protein or overhydration — often benign.",
    section: "kidney",
    short: "BUN",
  },
  gfr: {
    low: 90,
    unit: "mL/min/1.73m2",
    normalRange: "90+ mL/min/1.73m² typical normal",
    oneLiner: "How hard your kidney filters are working.",
    simple: "eGFR estimates milliliters of blood kidneys clean per minute.",
    testsFor: "Overall kidney filtering power.",
    highMeans: "Usually fine.",
    lowMeans: "Kidneys filtering less — needs clinical follow-up.",
    section: "kidney",
    short: "GFR",
  },
  egfr: {
    low: 90,
    unit: "mL/min/1.73m2",
    normalRange: "90+ mL/min/1.73m² typical normal",
    oneLiner: "How hard your kidney filters are working.",
    simple: "eGFR estimates kidney filter rate.",
    testsFor: "Overall kidney filtering power.",
    highMeans: "Usually fine.",
    lowMeans: "Kidneys filtering less.",
    section: "kidney",
    short: "GFR",
  },
  sodium: {
    low: 136,
    high: 145,
    unit: "mmol/L",
    normalRange: "About 136–145 mmol/L",
    oneLiner: "Main salt ion controlling water balance.",
    simple: "Sodium sets fluid balance and nerve firing.",
    testsFor: "Hydration and electrolyte balance.",
    highMeans: "Often free-water loss / dehydration.",
    lowMeans: "Too much water relative to sodium, or losses.",
    section: "electrolytes",
    short: "Na",
  },
  potassium: {
    low: 3.4,
    high: 5.2,
    unit: "mmol/L",
    normalRange: "About 3.4–5.2 mmol/L",
    oneLiner: "Critical for heart rhythm and muscle.",
    simple: "Potassium lives mostly inside cells; blood level is tightly kept.",
    testsFor: "Heart rhythm safety and kidney K⁺ handling.",
    highMeans: "Can disturb heart rhythm.",
    lowMeans: "Cramps, weakness, arrhythmia risk.",
    section: "electrolytes",
    short: "K",
  },
  chloride: {
    low: 98,
    high: 107,
    unit: "mmol/L",
    normalRange: "About 98–107 mmol/L",
    oneLiner: "Partners with sodium for charge balance.",
    simple: "Chloride helps acid–base and electrical neutrality.",
    testsFor: "Electrolyte and acid–base status.",
    highMeans: "Dehydration or acid shifts.",
    lowMeans: "Vomiting, diuretics, acid–base issues.",
    section: "electrolytes",
    short: "Cl",
  },
  calcium: {
    low: 8.8,
    high: 10.2,
    unit: "mg/dL",
    normalRange: "About 8.8–10.2 mg/dL",
    oneLiner: "Bone mineral + nerve/muscle signal.",
    simple: "Blood calcium is tightly controlled by PTH and vitamin D.",
    testsFor: "Parathyroid, vitamin D, bone, kidney handling.",
    highMeans: "Hyperparathyroidism or excess vitamin D patterns.",
    lowMeans: "Vitamin D deficiency or low albumin context.",
    section: "electrolytes",
    short: "Ca",
  },
  tsh: {
    low: 0.5,
    high: 4.3,
    unit: "mIU/L",
    normalRange: "About 0.5–4.3 mIU/L",
    oneLiner: "Brain signal that drives the thyroid.",
    simple: "TSH tells the thyroid to make more hormone. High TSH ≈ slow thyroid; low TSH ≈ hot thyroid.",
    testsFor: "Under- or over-active thyroid.",
    highMeans: "Possible hypothyroidism — fatigue, cold, heavy periods.",
    lowMeans: "Possible hyperthyroidism — anxiety, racing heart.",
    section: "thyroid",
    short: "TSH",
  },
  ferritin: {
    low: 30,
    high: 200,
    unit: "ng/mL",
    normalRange: "Often goal ~30–200 ng/mL (context matters)",
    oneLiner: "Stored iron — key for energy and periods.",
    simple: "Ferritin reflects iron stores. Low stores cause fatigue even before full anemia.",
    testsFor: "Iron deficiency and overload.",
    highMeans: "Inflammation or iron overload patterns.",
    lowMeans: "Low iron stores — common with heavy periods.",
    section: "iron",
    short: "Ferritin",
  },
  "iron, total": {
    low: 50,
    high: 170,
    unit: "ug/dL",
    normalRange: "About 50–170 µg/dL (labs vary)",
    oneLiner: "Circulating iron in blood.",
    simple: "Serum iron fluctuates; read with ferritin and TIBC.",
    testsFor: "Iron availability.",
    highMeans: "Can reflect overload or recent supplement.",
    lowMeans: "Suggests low available iron.",
    section: "iron",
    short: "Iron",
  },
  iron: {
    low: 50,
    high: 170,
    unit: "ug/dL",
    normalRange: "About 50–170 µg/dL",
    oneLiner: "Circulating iron in blood.",
    simple: "Serum iron fluctuates; pair with ferritin.",
    testsFor: "Iron availability.",
    highMeans: "Overload or recent supplement.",
    lowMeans: "Low available iron.",
    section: "iron",
    short: "Iron",
  },
  "vitamin d": {
    low: 30,
    high: 100,
    unit: "ng/mL",
    normalRange: "Often goal 30–100 ng/mL",
    oneLiner: "Bone, immunity, and mood-related vitamin.",
    simple: "Vitamin D helps calcium absorption and immune signaling.",
    testsFor: "Deficiency common with low sun exposure.",
    highMeans: "Excess supplementation risk if very high.",
    lowMeans: "Deficiency — bone, energy, immune effects.",
    section: "vitamins",
    short: "Vit D",
  },
  "25-hydroxyvitamin d": {
    low: 30,
    high: 100,
    unit: "ng/mL",
    normalRange: "Often goal 30–100 ng/mL",
    oneLiner: "Best blood test for vitamin D stores.",
    simple: "25-OH vitamin D is the standard status marker.",
    testsFor: "Vitamin D deficiency.",
    highMeans: "Too much supplement if extreme.",
    lowMeans: "Common deficiency.",
    section: "vitamins",
    short: "Vit D",
  },
  "vitamin b12": {
    low: 300,
    high: 900,
    unit: "pg/mL",
    normalRange: "Often ~300–900 pg/mL",
    oneLiner: "Nerve and red-cell vitamin.",
    simple: "B12 builds DNA and myelin; low levels cause fatigue and neuro symptoms.",
    testsFor: "B12 deficiency / absorption issues.",
    highMeans: "Usually from supplements.",
    lowMeans: "Anemia and nerve risk if low.",
    section: "vitamins",
    short: "B12",
  },
  "c-reactive protein": {
    high: 3,
    unit: "mg/L",
    normalRange: "Often under ~3 mg/L (assay-specific)",
    oneLiner: "General inflammation marker.",
    simple: "CRP rises when the body is inflamed (infection, injury, chronic stress).",
    testsFor: "Systemic inflammation.",
    highMeans: "Active inflammation — find the driver.",
    lowMeans: "Low inflammatory signal.",
    section: "inflammation",
    short: "CRP",
  },
  crp: {
    high: 3,
    unit: "mg/L",
    normalRange: "Often under ~3 mg/L",
    oneLiner: "General inflammation marker.",
    simple: "CRP rises with body-wide inflammation.",
    testsFor: "Systemic inflammation.",
    highMeans: "Active inflammation.",
    lowMeans: "Low inflammatory signal.",
    section: "inflammation",
    short: "CRP",
  },
  "hs-crp": {
    high: 2,
    unit: "mg/L",
    normalRange: "Lower is better for heart risk (assay-specific)",
    oneLiner: "Sensitive inflammation linked to heart risk.",
    simple: "High-sensitivity CRP tracks low-grade inflammation tied to arteries.",
    testsFor: "Cardiovascular inflammatory risk.",
    highMeans: "Higher inflammatory heart-risk signal.",
    lowMeans: "Lower inflammatory load.",
    section: "inflammation",
    short: "hs-CRP",
  },
};

const SECTION_META: Record<
  string,
  { label: string; blurb: string; order: number }
> = {
  cholesterol: {
    label: "Cholesterol",
    blurb:
      "Measures lipids carried in blood lipoproteins. LDL and related particles can deposit cholesterol in artery walls (atherosclerosis). HDL helps return cholesterol to the liver for disposal. Triglycerides are fat used for energy storage and rise with excess carbohydrate or alcohol. Total cholesterol and non HDL summarize the load of atherogenic particles. Ratios put LDL rich fractions in context of HDL. Read as a system of lipid transport and vascular risk, not one isolated number.",
    order: 1,
  },
  blood_sugar: {
    label: "Blood Sugar",
    blurb:
      "Measures glucose handling. Fasting glucose is a snapshot of blood sugar at one moment. Hemoglobin A1c is glucose stuck to hemoglobin and averages sugar exposure over roughly three months (red cell lifespan). Together they show short term fuel level and longer term glycemic control, which matter for energy, nerves, vessels, and metabolic disease risk.",
    order: 2,
  },
  blood_cells: {
    label: "Blood Cells",
    blurb:
      "The complete blood count (CBC). Red cells and hemoglobin carry oxygen from lungs to tissues. Hematocrit is the fraction of blood volume that is red cells. Indices (MCV, MCH, RDW) describe red cell size and hemoglobin content and help classify anemia types. White cells and their subtypes defend against infection and inflammation. Platelets start clotting at vessel injury. This panel maps oxygen delivery, immune readiness, and clotting capacity.",
    order: 3,
  },
  liver: {
    label: "Liver",
    blurb:
      "Markers of liver cell integrity, bile flow, protein synthesis, and heme waste handling. ALT and AST are enzymes that leak when hepatocytes are stressed. ALP rises with bile duct or bone turnover. Albumin and total protein reflect what the liver builds and what circulates. Bilirubin is the yellow product of hemoglobin breakdown processed by the liver into bile. Read as a map of liver work and injury, not a single pass/fail.",
    order: 4,
  },
  kidney: {
    label: "Kidney",
    blurb:
      "How well the kidneys filter blood. Creatinine is a muscle waste product cleared by the glomerulus; higher levels mean lower filtration (or higher muscle/creatine context). BUN is nitrogen waste from protein metabolism and also rises with low flow or dehydration. eGFR estimates milliliters of blood cleaned per minute from creatinine, age, and sex equations. This panel is renal filtration and waste clearance, always read with volume status.",
    order: 5,
  },
  electrolytes: {
    label: "Electrolytes & Minerals",
    blurb:
      "Measures the main charged ions in blood serum: sodium (Na⁺), potassium (K⁺), chloride (Cl⁻), bicarbonate/CO₂ (acid base buffer), and calcium (Ca²⁺). These ions set the electrical gradient across cell membranes, so they control nerve firing, muscle contraction (including the heart), and how water moves between blood and tissues (osmolarity). Sodium is the main extracellular cation and tracks free water balance. Potassium is the main intracellular cation and is tightly regulated for cardiac rhythm. Chloride moves with sodium for electroneutrality. CO₂/bicarbonate reflects metabolic acid base status. Calcium is required for excitation contraction coupling and is controlled by PTH and vitamin D. The panel is a snapshot of fluid, electrical, and acid base homeostasis, not a single hydration score. Interpret each value against its reference range and the rest of the metabolic panel (kidney, albumin).",
    order: 6,
  },
  thyroid: {
    label: "Thyroid",
    blurb:
      "TSH (thyroid stimulating hormone) is the pituitary signal that tells the thyroid to make T4/T3. High TSH usually means the thyroid is underproducing (body asking for more hormone). Low TSH usually means excess thyroid hormone or exogenous thyroid meds (body asking for less). Thyroid hormones set basal metabolic rate, heart rate, temperature, and influence cycle, mood, and lipids. TSH is the screening gate for thyroid axis tone.",
    order: 7,
  },
  iron: {
    label: "Iron",
    blurb:
      "Iron status for oxygen carrying hemoglobin. Ferritin reflects stored iron in tissues. Serum iron and related iron studies show circulating iron available for use. Low stores impair red cell production and energy. Excess iron is uncommon but toxic to organs. Read with hemoglobin and red cell indices when fatigue or heavy menses are in the picture.",
    order: 8,
  },
  vitamins: {
    label: "Vitamins",
    blurb:
      "Circulating vitamin levels that support enzyme cofactors, bone mineral handling, nerve myelin, and immune signaling. Vitamin D (25 OH) is the standard status marker for calcium absorption and immune tone. B12 and related markers support DNA synthesis and nerve health. Deficiency shows in blood and nerves long before it is obvious on exam.",
    order: 9,
  },
  inflammation: {
    label: "Inflammation",
    blurb:
      "Acute phase proteins and related markers that rise when the innate immune system is activated by infection, tissue injury, or chronic inflammatory load. CRP (and hs CRP) is made by the liver under cytokine drive. Elevations are nonspecific: they flag inflammation, not a single diagnosis. Trends matter more than one isolated blip.",
    order: 10,
  },
  hormones: {
    label: "Hormones",
    blurb:
      "Signaling molecules that set cycle rhythm, stress response, metabolism, and reproductive axis tone. Interpreting any single hormone needs timing (cycle day, fasting, time of day) and the paired gland (pituitary, ovary, adrenal, thyroid). Values are snapshots of endocrine messaging, not personality.",
    order: 11,
  },
  other: {
    label: "Other tests",
    blurb:
      "Additional ordered markers that do not sit in the core panels above. Each still has a physiologic meaning; open the test for the full explanation and range.",
    order: 99,
  },
};

// Keyword → section for unknown tests
const SECTION_KEYWORDS: { section: string; words: string[] }[] = [
  {
    section: "cholesterol",
    words: ["ldl", "hdl", "triglyceride", "cholesterol", "apob", "lipoprotein"],
  },
  {
    section: "blood_sugar",
    words: ["glucose", "a1c", "hba1c", "insulin", "fructosamine", "sugar"],
  },
  {
    section: "blood_cells",
    words: [
      "wbc",
      "rbc",
      "hgb",
      "hemoglobin",
      "hct",
      "hematocrit",
      "mcv",
      "mch",
      "mchc",
      "rdw",
      "plt",
      "platelet",
      "mpv",
      "neutrophil",
      "lymphocyte",
      "monocyte",
      "eosinophil",
      "basophil",
      "cbc",
    ],
  },
  {
    section: "liver",
    words: [
      "alt",
      "ast",
      "alp",
      "albumin",
      "bilirubin",
      "protein",
      "ggt",
      "liver",
    ],
  },
  {
    section: "kidney",
    words: ["creatinine", "bun", "gfr", "egfr", "urea", "kidney"],
  },
  {
    section: "electrolytes",
    words: [
      "sodium",
      "potassium",
      "chloride",
      "calcium",
      "magnesium",
      "co2",
      "bicarbonate",
      "phosphate",
    ],
  },
  {
    section: "thyroid",
    words: ["tsh", "t3", "t4", "thyroid", "free t4", "free t3"],
  },
  {
    section: "iron",
    words: ["ferritin", "iron", "tibc", "transferrin", "saturation"],
  },
  {
    section: "vitamins",
    words: ["vitamin", "b12", "folate", "folic", "25-hydroxy", "vit d"],
  },
  {
    section: "inflammation",
    words: ["crp", "hs-crp", "esr", "sed rate", "inflammation"],
  },
  {
    section: "hormones",
    words: [
      "estradiol",
      "estrogen",
      "progesterone",
      "testosterone",
      "cortisol",
      "fsh",
      "lh",
      "dhea",
      "prolactin",
    ],
  },
];

function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9/%+.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

export function categorizeTest(name: string): string {
  const k = normKey(name);
  const known = KNOWN[k];
  if (known) return known.section;
  // also try without punctuation variants
  for (const [key, ref] of Object.entries(KNOWN)) {
    if (k.includes(key) || key.includes(k)) return ref.section;
  }
  for (const row of SECTION_KEYWORDS) {
    if (row.words.some((w) => k.includes(w))) return row.section;
  }
  return "other";
}

export function computeStatus(
  value: number,
  ref?: { low?: number; high?: number }
): LabStatus {
  if (!ref) return "ok";
  if (ref.high != null && value > ref.high) return "high";
  if (ref.low != null && value < ref.low) return "low";
  return "ok";
}

function lookupRef(name: string): Ref | undefined {
  const k = normKey(name);
  if (KNOWN[k]) return KNOWN[k];
  for (const [key, ref] of Object.entries(KNOWN)) {
    if (k === key || k.includes(key) || key.includes(k)) return ref;
  }
  return undefined;
}

function enrich(
  name: string,
  value: number | string,
  unit: string,
  date: string,
  statusHint?: LabStatus,
  labName = "Imported lab"
): LabItem {
  const ref = lookupRef(name);
  const num =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/,/g, ""));
  let status: LabStatus = statusHint || "ok";
  if (!statusHint && Number.isFinite(num) && ref) {
    status = computeStatus(num, ref);
  }

  const display = titleCase(name.replace(/\s+/g, " ").trim());

  if (ref) {
    return {
      id: display,
      short: ref.short,
      displayName: display,
      fullName: display,
      value: Number.isFinite(num) ? num : value,
      unit: unit || ref.unit || "",
      status,
      normalRange: ref.normalRange,
      oneLiner: ref.oneLiner,
      simple: ref.simple,
      testsFor: ref.testsFor,
      highMeans: ref.highMeans,
      lowMeans: ref.lowMeans,
      date,
      lab: labName,
    };
  }

  // Unknown test — still thorough plain-English defaults
  return {
    id: display,
    short: display.length > 14 ? display.slice(0, 14) : display,
    displayName: display,
    fullName: display,
    value: Number.isFinite(num) ? num : value,
    unit,
    status,
    normalRange: "See lab report reference range",
    oneLiner: `${display} is a lab marker your clinician ordered for your health picture.`,
    simple: `${display} is a blood (or body-fluid) test result. Your lab compares it to a reference range. Numbers outside range don’t diagnose alone — they flag what to discuss with your doctor in context of symptoms, meds, and history.`,
    testsFor: `Why this was ordered depends on your clinician’s question — screening, monitoring a condition, or checking treatment. Keep the full panel and prior results for comparison.`,
    highMeans: `If high, your lab flagged it above the reference range. Causes vary by marker — hydration, diet, inflammation, organ stress, or lab timing. Bring the value and range to your doctor.`,
    lowMeans: `If low, your lab flagged it below the reference range. Meaning depends on the specific marker. Compare with symptoms and prior labs with your clinician.`,
    date,
    lab: labName,
  };
}

// ── Storage ──

/** Refresh educational copy from seed when we improve explanations */
function mergeSeedCopy(stored: LabItem[]): LabItem[] {
  const seedBy = new Map(
    SEED_LABS.map((s) => [normKey(s.id), s] as const)
  );
  return stored.map((item) => {
    const seed = seedBy.get(normKey(item.id));
    if (!seed) return item;
    // Keep measured value/status/date; always upgrade teaching text
    return {
      ...item,
      oneLiner: seed.oneLiner || item.oneLiner,
      simple: seed.simple || item.simple,
      testsFor: seed.testsFor || item.testsFor,
      highMeans: seed.highMeans || item.highMeans,
      lowMeans: seed.lowMeans || item.lowMeans,
      normalRange: seed.normalRange || item.normalRange,
      fullName: seed.fullName || item.fullName,
      short: seed.short || item.short,
    };
  });
}

export function loadLabs(): LabItem[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as LabItem[];
      if (Array.isArray(data) && data.length) {
        const merged = mergeSeedCopy(data);
        // Persist upgraded explanations so popups stay current
        saveLabs(merged);
        return merged;
      }
    }
  } catch {
    /* ignore */
  }
  return SEED_LABS.map((l) => ({ ...l }));
}

export function saveLabs(items: LabItem[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

/** Merge incoming into existing: same test id/name → update value/status/date; new tests → add */
export function mergeLabs(existing: LabItem[], incoming: LabItem[]): LabItem[] {
  const map = new Map<string, LabItem>();
  for (const e of existing) {
    map.set(normKey(e.id), e);
  }
  for (const inc of incoming) {
    const key = normKey(inc.id);
    const prev = map.get(key);
    if (prev) {
      // Update numbers; keep rich text if import is thin
      map.set(key, {
        ...prev,
        value: inc.value,
        unit: inc.unit || prev.unit,
        status: inc.status,
        date: inc.date || prev.date,
        lab: inc.lab || prev.lab,
        normalRange: inc.normalRange || prev.normalRange,
        oneLiner: prev.oneLiner || inc.oneLiner,
        simple: prev.simple.length > (inc.simple?.length || 0) ? prev.simple : inc.simple,
        testsFor:
          prev.testsFor.length > (inc.testsFor?.length || 0)
            ? prev.testsFor
            : inc.testsFor,
        highMeans: prev.highMeans || inc.highMeans,
        lowMeans: prev.lowMeans || inc.lowMeans,
        displayName: prev.displayName || inc.displayName,
        fullName: prev.fullName || inc.fullName,
        short: prev.short || inc.short,
      });
    } else {
      map.set(key, inc);
    }
  }
  return [...map.values()];
}

// ── Parse free text / CSV / JSON ──

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseStatusWord(s: string): LabStatus | undefined {
  const t = s.toLowerCase();
  if (/\b(high|h|above|elevated)\b/.test(t)) return "high";
  if (/\b(low|l|below)\b/.test(t)) return "low";
  if (/\b(ok|normal|wnl|in range)\b/.test(t)) return "ok";
  return undefined;
}

function parseDateFromText(text: string): string {
  // MM/DD/YYYY or YYYY-MM-DD
  const m1 = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m1) {
    const [, mo, da, y] = m1;
    return `${y}-${mo.padStart(2, "0")}-${da.padStart(2, "0")}`;
  }
  const m2 = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m2) return m2[0];
  return todayISO();
}

/** Line patterns like: LDL Cholesterol 120 mg/dL High */
function parseTextLabs(text: string): LabItem[] {
  const date = parseDateFromText(text);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: LabItem[] = [];

  // JSON array?
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed);
      const arr = Array.isArray(data) ? data : data.results || data.labs || [];
      for (const row of arr) {
        const name = String(row.name || row.test || row.id || "").trim();
        if (!name) continue;
        const value = row.value ?? row.result;
        const unit = String(row.unit || "");
        const st = parseStatusWord(String(row.status || "")) || undefined;
        out.push(enrich(name, value, unit, row.date || date, st, row.lab));
      }
      if (out.length) return out;
    } catch {
      /* fall through to line parse */
    }
  }

  for (const line of lines) {
    // skip headers
    if (/^(test|result|status|component|reference)/i.test(line)) continue;

    // Name .... 120.5 mg/dL High
    const m = line.match(
      /^(.+?)\s+([<>]?-?\d+\.?\d*)\s*([a-zA-Z%µuU/^0-9·.-]+)?\s*(high|low|normal|ok|elevated|above|below|h|l)?\s*$/i
    );
    if (m) {
      const name = m[1].replace(/[,:]+$/, "").trim();
      const value = Number(m[2].replace(/[<>]/g, ""));
      const unit = (m[3] || "").trim();
      const st = parseStatusWord(m[4] || "");
      if (name.length >= 2 && Number.isFinite(value)) {
        out.push(enrich(name, value, unit, date, st));
      }
      continue;
    }

    // CSV: name,value,unit,status
    const parts = line.split(/[,\t]/).map((p) => p.trim());
    if (parts.length >= 2) {
      const name = parts[0];
      const value = Number(parts[1].replace(/[<>]/g, ""));
      const unit = parts[2] || "";
      const st = parseStatusWord(parts[3] || "");
      if (name && Number.isFinite(value)) {
        out.push(enrich(name, value, unit, date, st));
      }
    }
  }
  return out;
}

export type ImportResult = {
  items: LabItem[];
  added: number;
  updated: number;
  message: string;
};

export function importLabPayload(
  existing: LabItem[],
  raw: string
): ImportResult {
  const incoming = parseTextLabs(raw);
  if (!incoming.length) {
    return {
      items: existing,
      added: 0,
      updated: 0,
      message:
        "No lab numbers found. Paste lines like: LDL Cholesterol 120 mg/dL High",
    };
  }
  const before = new Set(existing.map((e) => normKey(e.id)));
  const merged = mergeLabs(existing, incoming);
  let updated = 0;
  let added = 0;
  for (const inc of incoming) {
    if (before.has(normKey(inc.id))) updated++;
    else added++;
  }
  saveLabs(merged);
  return {
    items: merged,
    added,
    updated,
    message: `Imported ${incoming.length}: ${updated} updated · ${added} new`,
  };
}

export function buildSections(items: LabItem[]): BuiltSection[] {
  // Map each item → section
  const bySection = new Map<string, LabItem[]>();

  for (const item of items) {
    const sec = lookupRef(item.id)?.section || categorizeTest(item.id);
    if (!bySection.has(sec)) bySection.set(sec, []);
    bySection.get(sec)!.push(item);
  }

  // Preserve base section order for known panels; append dynamic
  const orderedIds = [
    ...BASE_SECTIONS.map((s) => s.id),
    ...Object.keys(SECTION_META)
      .filter((id) => !BASE_SECTIONS.some((b) => b.id === id))
      .sort((a, b) => (SECTION_META[a].order || 50) - (SECTION_META[b].order || 50)),
  ];

  const seen = new Set<string>();
  const out: BuiltSection[] = [];

  for (const id of orderedIds) {
    const list = bySection.get(id);
    if (!list?.length) continue;
    seen.add(id);
    const meta = SECTION_META[id] || {
      label: titleCase(id.replace(/_/g, " ")),
      blurb: "Lab results in this group.",
      order: 50,
    };
    const base = BASE_SECTIONS.find((b) => b.id === id);
    const dates = list.map((i) => i.date).sort();
    out.push({
      id,
      label: base?.label || meta.label,
      blurb: base?.blurb || meta.blurb,
      itemIds: list.map((i) => i.id),
      items: list,
      status: sectionStatus(list),
      date: dates[dates.length - 1] || "",
    });
  }

  // Any leftover sections
  for (const [id, list] of bySection) {
    if (seen.has(id) || !list.length) continue;
    const meta = SECTION_META[id] || {
      label: titleCase(id.replace(/_/g, " ")),
      blurb: "Additional lab results.",
      order: 99,
    };
    const dates = list.map((i) => i.date).sort();
    out.push({
      id,
      label: meta.label,
      blurb: meta.blurb,
      itemIds: list.map((i) => i.id),
      items: list,
      status: sectionStatus(list),
      date: dates[dates.length - 1] || "",
    });
  }

  return out;
}

export { formatLabDate, sectionStatus };
