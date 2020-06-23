/* global BookReader */
/**
 * Plugin for chapter markers in BookReader. Fetches from openlibrary.org
 * Could be forked, or extended to alter behavior
 */

const { SingleEntryPlugin } = require("webpack");

jQuery.extend(BookReader.defaultOptions, {
  olHost: 'https://openlibrary.org',
  enableChaptersPlugin: true,
  bookId: '',
});

/** @override Extend the constructor to add search properties */
BookReader.prototype.setup = (function (super_) {
  return function (options) {
    super_.call(this, options);

    this.olHost = options.olHost;
    this.enableChaptersPlugin = options.enableChaptersPlugin;
    this.bookId = options.bookId;
  };
})(BookReader.prototype.setup);

/** @override Extend to call Open Library for TOC */
BookReader.prototype.init = (function(super_) {
  return function() {
    super_.call(this);
    if (this.enableChaptersPlugin && this.ui !== 'embed') {
      this.getOpenLibraryRecord();
    }
    if (this.enableMobileNav) {
      this.bind(BookReader.eventNames.mobileNavOpen, 
        () => { if($('#mm-4').hasClass('mm-opened')){
          this.updateTOCState(this.firstIndex+1, this._tocEntries);
        }}
      )
      this.bind(BookReader.eventNames.TOCOpen,
        () => {
          this.updateTOCState(this.firstIndex+1, this._tocEntries);
        }
      )
    }
  }
})(BookReader.prototype.init);

/**
 * Adds chapter marker to navigation scrubber
 *
 * @param {string} chapterTitle
 * @param {string} pageNumber
 * @param {number} pageIndex
 */
BookReader.prototype.addChapter = function(chapterTitle, pageNumber, pageIndex) {
  const uiStringPage = 'Page'; // i18n
  const percentThrough = BookReader.util.cssPercentage(pageIndex, this.getNumLeafs() - 1);
  const jumpToChapter = (event) => {
     this.jumpToIndex($(event.target).data('pageIndex'));
     $('.current-chapter').removeClass('current-chapter');
     $(event.target).addClass('current-chapter');
  }
  const title = `${chapterTitle} | ${uiStringPage} ${pageNumber}`;

  //adding items to mobile table of contents
  const mobileChapter = $(`<li>${title}</li>`);
  mobileChapter.addClass('table-contents-el')
  .appendTo(this.$('.table-contents-list'))
  .data({ pageIndex });
 
  
  //adds .BRchapters to the slider only if pageIndex exists
  if(pageIndex!=undefined){
    $(`<div><div>${title}</div></div>`)
      .addClass('BRchapter')
      .css({ left: percentThrough })
      .appendTo(this.$('.BRnavline'))
      .data({ pageIndex })
      .bt({
        contentSelector: '$(this).find("> div")',
        trigger: 'hover',
        closeWhenOthersOpen: true,
        cssStyles: {
          padding: '12px 14px',
          backgroundColor: '#fff',
          border: '4px solid rgb(216,216,216)',
          color: 'rgb(52,52,52)'
        },
        shrinkToFit: false,
        width: '230px',
        padding: 0,
        spikeGirth: 0,
        spikeLength: 0,
        overlap: '0px',
        overlay: false,
        killTitle: false,
        offsetParent: null,
        positions: ['top'],
        fill: 'white',
        windowMargin: 10,
        strokeWidth: 0,
        cornerRadius: 0,
        centerPointX: 0,
        centerPointY: 0,
        shadow: false
      })
      .hover(event => {
      // remove hover effect from other markers then turn on just for this
        this.$('.BRsearch,.BRchapter').removeClass('front');
        $(event.target).addClass('front');
      },
      event => $(event.target).removeClass('front')
      )
      .bind('click', jumpToChapter);

      //adding clickable properties to mobile chapters
      mobileChapter.bind('click', jumpToChapter)
        .addClass('chapter-clickable');
  }
 
};

/*
 * Remove all chapters.
 */
BookReader.prototype.removeChapters = function() {
  this.$('.BRnavpos .BRchapter').remove();
};

/**
 * Update the table of contents based on array of TOC entries.
 * @param {TocEntry[]} tocEntries
 */
BookReader.prototype.updateTOC = function(tocEntries) {
  this.removeChapters();
  if(tocEntries.length>0){
    this.$(".BRmobileMenu__tableContents").show();
  }
  for (let i = 0; i < tocEntries.length; i++) {
    this.addChapterFromEntry(tocEntries[i]);
  }
  this._tocEntries = tocEntries;
  $('.table-contents-list').children().each((i, el) => {
    tocEntries[i].mobileHTML = el;
  })
};

/**
 * @typedef {Object} TocEntry
 * Table of contents entry as defined -- format is defined by Open Library
 * @property {string} pagenum
 * @property {number} level
 * @property {string} label
 * @property {{type: '/type/toc_item'}} type
 * @property {string} title
 * @property {HTMLElement} mobileHTML
 * @property {number} pageIndex

 *
 * @example {
 *   "pagenum": "17",
 *   "level": 1,
 *   "label": "CHAPTER I",
 *   "type": {"key": "/type/toc_item"},
 *   "title": "THE COUNTRY AND THE MISSION"
 * }
 */

/**
 * @param {TocEntry} tocEntryObject
 */
BookReader.prototype.addChapterFromEntry = function(tocEntryObject) {
  tocEntryObject.pageIndex = this.getPageIndex(tocEntryObject['pagenum']);
  //creates a string with non-void tocEntryObject.label and tocEntryObject.title
  const chapterStr = [tocEntryObject.label, tocEntryObject.title]
    .filter(x => x)
    .join(' ');
  this.addChapter(chapterStr, tocEntryObject['pagenum'], tocEntryObject.pageIndex);
  this.$('.BRchapter, .BRsearch').each((i, el) => {
    const $el = $(el);
    $el.hover(
      () => $el.addClass('front'),
      () => $el.removeClass('front'));
  });
};

/**
 * getOpenLibraryRecord
 *
 * The bookreader is designed to call openlibrary API and constructs the
 * "Return book" button using the response.
 *
 * This makes a call to OL API and calls the given callback function with the
 * response from the API.
 */
BookReader.prototype.getOpenLibraryRecord = function () {
  // Try looking up by ocaid first, then by source_record
  const baseURL = `${this.olHost}//query.json?type=/type/edition&*=`;
  const fetchUrlByBookId = `${baseURL}&ocaid=${this.bookId}`;

  /*
  * Update Chapter markers based on received record from Open Library.
  * Notes that Open Library record is used for extra metadata, and also for lending
  */
  const setUpChapterMarkers = (olObject) => {
    if (olObject && olObject.table_of_contents) {
      // XXX check here that TOC is valid
      this.updateTOC(olObject.table_of_contents);
    }
  };

  $.ajax({ url: fetchUrlByBookId, dataType: 'jsonp' })
    .then(data => {
      if (data && data.length > 0) {
        return data;
      } else {
      // try sourceid
        return $.ajax({ url: `${baseURL}&source_records=ia:${this.bookId}`, dataType: 'jsonp' });
      }
    })
    .then(data => {
      if (data && data.length > 0) {
        setUpChapterMarkers(data[0]);
      }
    });
}

// Extend buildMobileDrawerElement with table of contents list
BookReader.prototype.buildMobileDrawerElement = (function (super_) {
  return function () {
    const $el = super_.call(this);
    if (this.options.enableChaptersPlugin) {
      $el.find('.BRmobileMenu__moreInfoRow').after($(`
        <li class="BRmobileMenu__tableContents" data-event-click-tracking=”BRSidebar|TOCPanel>
            <span>
                <span class="DrawerIconWrapper"></span>
                Table of Contents
            </span>
            <div>
                <ol class="table-contents-list">
                </ol>
            </div>
        </li>`).hide());
    }
    return $el;
  };
})(BookReader.prototype.buildMobileDrawerElement);

/**
 * highlights the current chapter based on current page
 * @private
 * @param {TocEntry[]} tocEntries
 * @param {number} tocEntries
 */
BookReader.prototype.updateTOCState = function(currIndex, tocEntries) {
  $('.current-chapter').removeClass('current-chapter');
  const tocEntriesIndexed = tocEntries.filter((el) => el.pageIndex != undefined).reverse();
  const currChapter = tocEntriesIndexed[tocEntriesIndexed.findIndex(
    (el) => el.pageIndex <= currIndex)];
  if(currChapter != undefined){
    $(currChapter.mobileHTML).addClass('current-chapter');

    //$('.table-contents-list').scrollTop($('.current-chapter').offset().top);
    // $('.current-chapter')[0].scrollIntoView({block: "center"});
    $('.current-chapter')[0].scrollIntoView({block: "center"});
  }
}

