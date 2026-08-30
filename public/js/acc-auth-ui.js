(function () {
  "use strict";

  document.querySelectorAll(".acc-social-btn").forEach(function (btn) {
    if (btn.classList.contains("acc-social-google") || btn.classList.contains("acc-social-discord")) return;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var soon = document.querySelector(".acc-social-soon");
      if (soon) soon.classList.add("is-shown");
    });
  });
})();
