"""Daily Bhagavad Gita quote — one per calendar day, stable by date."""

from __future__ import annotations

from datetime import date

from .db import today

# Fuller plain-language lines + tap-to-read explanations.
# Theme: discipline, clarity, action over laziness, duty, mastering the mind.
GITA_QUOTES: tuple[dict[str, str | int], ...] = (
    {
        "text": (
            "You have a right to your work, but you are not entitled to the fruits of that work. "
            "Do not let success make you lazy, and do not let failure make you quit. "
            "Show up anyway."
        ),
        "explain": (
            "This is the antidote to waiting until you feel sure. Clarity comes from motion, not from "
            "staring at your phone. Your job is the next honest action — not guaranteed outcomes."
        ),
        "chapter": 2,
        "verse": 47,
    },
    {
        "text": (
            "Perform your duty with a steady mind. Treat gain and loss, praise and blame, heat and cold, "
            "honor and dishonor the same — and keep working."
        ),
        "explain": (
            "Discipline is not mood-dependent. You don't need to feel motivated to be consistent. "
            "Equanimity means your standards don't collapse when the day gets uncomfortable."
        ),
        "chapter": 2,
        "verse": 48,
    },
    {
        "text": (
            "On this path, no effort is ever lost, and no step forward is wasted. "
            "Even a little progress on the right path protects you from the deepest kind of fear."
        ),
        "explain": (
            "The lazy voice says \"why bother — it won't matter.\" This verse says the opposite: "
            "showing up today builds the person who won't quit tomorrow."
        ),
        "chapter": 2,
        "verse": 40,
    },
    {
        "text": (
            "Work must be done, but always without attachment to the reward. "
            "A person who acts only for results becomes anxious, scattered, and easy to derail."
        ),
        "explain": (
            "When you're unclear on your life, you often chase feelings instead of structure. "
            "Attach to the work itself — the reps, the routine, the next task — and momentum returns."
        ),
        "chapter": 3,
        "verse": 19,
    },
    {
        "text": (
            "Those who are motivated only by the fruit of action are miserable, "
            "because they live in constant anxiety about whether they will win or lose."
        ),
        "explain": (
            "If every day is a verdict on your worth, paralysis makes sense — but it's a trap. "
            "Stop negotiating with the outcome. Execute the process you already know is right."
        ),
        "chapter": 2,
        "verse": 49,
    },
    {
        "text": (
            "One who restrains the senses outwardly but keeps dwelling on sense objects in the mind "
            "is deluding himself and is called a pretender."
        ),
        "explain": (
            "Scrolling while telling yourself you'll start later is not discipline — it's performance. "
            "Real change is when your attention and your actions finally match."
        ),
        "chapter": 3,
        "verse": 6,
    },
    {
        "text": (
            "One must deliver himself by the mind, and not degrade himself. "
            "The mind is the friend of the soul, and the mind is also the enemy."
        ),
        "explain": (
            "Laziness often starts as a story: \"I'm tired,\" \"I'll do it when it's clear,\" \"not today.\" "
            "That voice is not truth — it's an untrained mind. Train it, or it runs your life."
        ),
        "chapter": 6,
        "verse": 5,
    },
    {
        "text": (
            "For one who has conquered the mind, the mind is the best of friends. "
            "For one who has failed to do so, the mind remains the greatest enemy."
        ),
        "explain": (
            "Discipline is not punishment — it's making the mind work for you instead of against you. "
            "Every time you keep a small promise to yourself, you weaken the enemy."
        ),
        "chapter": 6,
        "verse": 6,
    },
    {
        "text": (
            "One who is able to control the senses and fix consciousness on the goal "
            "is known as steady — established in real discipline."
        ),
        "explain": (
            "You don't need a perfect life plan to start. You need one clear priority and the "
            "will to protect your attention from everything that isn't it."
        ),
        "chapter": 6,
        "verse": 14,
    },
    {
        "text": (
            "One who is regulated in eating, sleeping, work, and recreation "
            "can reduce suffering through disciplined living."
        ),
        "explain": (
            "Chaos in the body makes chaos in the mind. Irregular sleep, skipped meals, and no structure "
            "feel like confusion — often they're just bad rhythm. Fix the rhythm, regain clarity."
        ),
        "chapter": 6,
        "verse": 17,
    },
    {
        "text": (
            "It is far better to perform your own duty, however imperfectly, "
            "than to perform another's duty perfectly."
        ),
        "explain": (
            "Comparison steals action. You're not behind someone else's timeline — you're avoiding "
            "your own responsibilities. Do your actual work, not the fantasy of someone else's path."
        ),
        "chapter": 18,
        "verse": 47,
    },
    {
        "text": (
            "Every path has flaws, like smoke around fire. "
            "Do not abandon the work you were born to do just because it is not perfect."
        ),
        "explain": (
            "Waiting for the perfect plan is a sophisticated form of laziness. "
            "Your routine will be messy at first. Start messy. Refine while moving."
        ),
        "chapter": 18,
        "verse": 48,
    },
    {
        "text": (
            "One who sees inaction in action, and action in inaction, is wise among people "
            "and remains on the right path even while busy."
        ),
        "explain": (
            "Not all motion is progress — busywork can hide avoidance. And real progress sometimes "
            "looks quiet: planning, resting, deciding. Learn the difference. Stop hiding in fake activity."
        ),
        "chapter": 4,
        "verse": 18,
    },
    {
        "text": (
            "Perform your bounden duty, for action is better than inaction. "
            "Even maintaining the body is not possible without work."
        ),
        "explain": (
            "Inaction has a cost too — it erodes health, confidence, and self-respect. "
            "When you feel stuck, the medicine is usually the next small task, not more thinking."
        ),
        "chapter": 3,
        "verse": 8,
    },
    {
        "text": (
            "The wise should act without attachment, for the good of the world, "
            "while others act from desire and cling to results."
        ),
        "explain": (
            "Do the right thing because it needs doing — not because you feel inspired. "
            "Inspiration follows action more often than the other way around."
        ),
        "chapter": 3,
        "verse": 25,
    },
    {
        "text": (
            "Whatever a great person does, ordinary people follow. "
            "Whatever standard they set, the world adopts."
        ),
        "explain": (
            "You are always setting a standard — for your future self, your household, your work. "
            "If you tolerate sloppiness today, you teach yourself that sloppiness is who you are."
        ),
        "chapter": 3,
        "verse": 21,
    },
    {
        "text": (
            "One who performs duty without attachment, offering the results to the Divine, "
            "is not bound by action, as a lotus leaf is untouched by water."
        ),
        "explain": (
            "Do your part fully, then release the grip. You did the workout, the study, the hard conversation — "
            "that is enough for today. Guilt and obsession waste the energy you need tomorrow."
        ),
        "chapter": 5,
        "verse": 10,
    },
    {
        "text": (
            "The embodied soul is eternal, indestructible, and immeasurable. "
            "No weapon can cut it, no fire burn it, no water wet it, no wind dry it."
        ),
        "explain": (
            "One bad week does not define you. Neither does laziness today erase your capacity tomorrow. "
            "Your identity is deeper than your current slump — get up and act from that truth."
        ),
        "chapter": 2,
        "verse": 23,
    },
    {
        "text": (
            "When a person responds to the joys and sorrows of sense objects, "
            "they become eligible for both — attachment and aversion bind them."
        ),
        "explain": (
            "Comfort, praise, and distraction pull you off course as much as fear does. "
            "Discipline means not letting either pleasure or discomfort dictate whether you show up."
        ),
        "chapter": 2,
        "verse": 14,
    },
    {
        "text": (
            "The nonpermanent appearance of happiness and distress, and their disappearance in due course, "
            "are like the winter and summer seasons. Learn to tolerate them without being derailed."
        ),
        "explain": (
            "Low-motivation days will come. That is not a sign to abandon the plan — it's weather. "
            "Dress for it. Do the minimum. Stay in the game."
        ),
        "chapter": 2,
        "verse": 15,
    },
    {
        "text": (
            "From the mode of passion, real knowledge becomes covered, "
            "and one becomes bound to endless activity and desire."
        ),
        "explain": (
            "Restlessness feels like ambition but often masks lack of direction. "
            "If you're busy yet empty, pause and name the one thing that actually matters this week."
        ),
        "chapter": 14,
        "verse": 9,
    },
    {
        "text": (
            "When passion increases, attachment, craving, and intense effort arise — "
            "and the thirst for more never feels satisfied."
        ),
        "explain": (
            "More plans, more tabs, more \"research\" can be procrastination in a productive costume. "
            "Clarity is choosing fewer targets and hitting them daily."
        ),
        "chapter": 14,
        "verse": 12,
    },
    {
        "text": (
            "The mode of goodness illuminates and frees one from sinful reaction. "
            "Those established in goodness develop knowledge."
        ),
        "explain": (
            "Clarity grows in calm, honest routines — sleep, food, movement, truth-telling. "
            "You can't think your way out of a fog you created with neglect."
        ),
        "chapter": 14,
        "verse": 6,
    },
    {
        "text": (
            "Perform all work as an offering, with your mind fixed on the highest, "
            "without selfish motive and without clinging to success or failure."
        ),
        "explain": (
            "When life feels meaningless, tie action to something larger than mood: health, family, craft, service, God. "
            "Purpose is built through commitment, not discovered on the couch."
        ),
        "chapter": 18,
        "verse": 57,
    },
    {
        "text": (
            "If you become conscious of Me with a devoted mind, you will pass over all obstacles "
            "by My grace. If you act through false ego and ignore this, you will be lost."
        ),
        "explain": (
            "Arrogance says you don't need help or structure. Despair says nothing will work. "
            "Both keep you inactive. Humility plus daily duty is how you get unstuck."
        ),
        "chapter": 18,
        "verse": 58,
    },
    {
        "text": (
            "Abandon all varieties of religion and surrender unto Me alone. "
            "I shall deliver you from all sinful reaction. Do not fear."
        ),
        "explain": (
            "Stop carrying every mistake like proof you can't change. Surrender the past, "
            "take today's duty seriously, and move — fear is not a valid excuse for inaction."
        ),
        "chapter": 18,
        "verse": 66,
    },
    {
        "text": (
            "One who is equal to friends and enemies, honor and dishonor, heat and cold, "
            "pleasure and pain — such a person is fit for immortality."
        ),
        "explain": (
            "Discipline means your behavior doesn't swing with applause, rejection, or comfort. "
            "You keep the schedule because you decided to — not because the day feels easy."
        ),
        "chapter": 12,
        "verse": 18,
    },
    {
        "text": (
            "A person is said to be established in wisdom when they give up all desires "
            "that enter the mind and remain satisfied in the self alone."
        ),
        "explain": (
            "Every new impulse — skip it, scroll, postpone — is a test. "
            "Satisfaction comes from self-mastery, not from another hit of distraction."
        ),
        "chapter": 2,
        "verse": 55,
    },
    {
        "text": (
            "Work done as a sacrifice for the Supreme must be performed; "
            "otherwise work done for selfish sense gratification binds a person."
        ),
        "explain": (
            "Ask: is this action building my life or just soothing my anxiety? "
            "Sacrifice here means purposeful work — the gym, the job, the study — not endless comfort."
        ),
        "chapter": 3,
        "verse": 9,
    },
    {
        "text": (
            "Even kings like Janaka attained perfection through action alone. "
            "Therefore, for the instruction of the world, you also should perform your work."
        ),
        "explain": (
            "You don't need perfect clarity to begin. Janaka had duty, not certainty. "
            "Your life gets clearer when you stop avoiding the work in front of you."
        ),
        "chapter": 3,
        "verse": 20,
    },
    {
        "text": (
            "One whose work is offered in sacrifice becomes free from bondage to action, "
            "but one who works only for personal enjoyment becomes entangled."
        ),
        "explain": (
            "Chasing only what feels good today is how weeks disappear. "
            "Freedom is doing what your future self will thank you for — especially when you don't feel like it."
        ),
        "chapter": 4,
        "verse": 23,
    },
    {
        "text": (
            "By worship of the Lord, who is the source of all beings, "
            "a person can attain perfection through the work they are already meant to do."
        ),
        "explain": (
            "Your path is not somewhere else. It's in the responsibilities you already have — "
            "health, family, craft, faith. Stop searching for a new identity. Elevate the one you're in."
        ),
        "chapter": 18,
        "verse": 46,
    },
)


def quote_for_day(day: str | None = None) -> dict[str, str]:
    """Return one Gita quote for the given ISO date (default: today)."""
    iso = (day or today()).strip()
    y, m, d = (int(part) for part in iso.split("-"))
    idx = date(y, m, d).toordinal() % len(GITA_QUOTES)
    entry = GITA_QUOTES[idx]
    return {
        "text": str(entry["text"]),
        "explain": str(entry["explain"]),
        "ref": f"Bhagavad Gita {entry['chapter']}.{entry['verse']}",
        "chapter": str(entry["chapter"]),
        "verse": str(entry["verse"]),
    }
