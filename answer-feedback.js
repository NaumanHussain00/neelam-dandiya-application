window.answer = function (button, option, question) {
  if (state.locked) return;

  state.locked = true;
  button.blur();

  const buttons = [...document.querySelectorAll(".answer")];
  buttons.forEach((answerButton) => answerButton.classList.add("disabled"));

  if (option === question.answer) {
    button.classList.add("correct");
    $("feedback").textContent = "Correct!";
    state.score++;

    if (state.index === 2) {
      updateLead({ score: 3, result: "won", status: "completed" });
      setTimeout(() => finish(true), 650);
    } else {
      state.index++;
      setTimeout(() => {
        state.locked = false;
        renderQuestion();
      }, 550);
    }
    return;
  }

  button.classList.add("wrong");
  const correctButton = buttons.find(
    (answerButton) => answerButton.textContent === question.answer,
  );
  correctButton?.classList.add("correct");
  $("feedback").textContent = `Incorrect! Correct answer: ${question.answer}`;
  updateLead({ score: state.score, result: "lost", status: "completed" });
  setTimeout(() => finish(false), 1800);
};