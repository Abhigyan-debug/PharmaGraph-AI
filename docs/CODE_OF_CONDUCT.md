# Code of conduct

PharmGraph AI is built by three people (Neural Cyphers T-100, GLA University Mathura) as a
university project. This file is short because the team is small, but it covers how we treat
each other and how we treat the work, and it applies to anyone who opens an issue or sends a
change.

## How we work with each other

- Be respectful in issues, reviews and chat, including when you disagree about the code.
- Review the change, not the person. "This breaks the pair_key check" is useful; "you always
  break things" isn't.
- If you take a task, say so on the issue. If you can't finish it, say that early so someone
  else can pick it up. Going quiet for a week is the thing that hurts a three-person team most.
- Answer review comments, even if the answer is "I'll fix this in the next commit".
- Nobody gets harassed, insulted or singled out, online or in person. That includes comments
  about anyone's background, gender, religion, region or language.

## How we treat the work

This part matters more for us than for most projects, because the project is graded and the
subject is medicines.

- **Report results honestly.** Metrics in the model report come from an actual run, with the
  seed and dataset version recorded. If the GCN doesn't beat the baseline, we write that down.
  No numbers are copied from papers or adjusted to look better.
- **Credit people properly.** Each commit is made by the person who did the work. If you build
  on a teammate's code or a published method, say so in the commit message or the doc.
- **Respect data licences.** We don't commit raw data, don't redistribute KEGG or DDInter
  files, and always cite our sources. Details are in `data/README.md`.
- **Don't overstate what the app does.** It's a decision-support prototype. Nothing we write,
  in the UI or the report, should suggest it is safe for clinical use.

## If something goes wrong

Talk to any team member first. If the problem involves a team member, or talking it out doesn't
work, take it to our project guide. Concerns are kept between the people involved.

Most problems are fixed by a conversation. If behaviour keeps repeating after that, the project
guide decides what happens next, in line with university rules.

## Credit

Adapted from the [Contributor Covenant 3.0](https://www.contributor-covenant.org/), shortened
for a small team, with an academic integrity section added for this project.
