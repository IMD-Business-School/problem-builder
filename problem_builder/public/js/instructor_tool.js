function InstructorToolBlock(runtime, element) {
    'use strict';
    var $element = $(element);

    // Pagination

    $(document).ajaxSend(function(event, jqxhr, options) {
        if (options.url.indexOf('get_result_page') !== -1) {
            options.data = JSON.stringify(options.data);
        }
    });

    var Result = Backbone.Model.extend({

        initialize: function(attrs, options) {
            _.each(_.zip(Result.properties, options.values), function(pair) {
                this.set(pair[0], pair[1]);
            }, this);
        }

    }, { properties: ['section', 'subsection', 'unit', 'type', 'question', 'answer', 'username'] });

    var Results = Backbone.PageableCollection.extend({

        model: Result,

        state: {
            order: 0
        },

        url: runtime.handlerUrl(element, 'get_result_page'),

        parseState: function(response) {
            return {
                totalRecords: response.num_results,
                pageSize: response.page_size
            };
        },

        parseRecords: function(response) {
            return _.map(response.display_data, function(row) {
                return new Result(null, { values: row });
            });
        },

        fetchOptions: {
            reset: true,
            type: 'POST',
            contentType: 'application/json',
            processData: false
        },

        getFirstPage: function() {
            Backbone.PageableCollection.prototype
                .getFirstPage.call(this, this.fetchOptions);
        },

        getPreviousPage: function() {
            Backbone.PageableCollection.prototype
                .getPreviousPage.call(this, this.fetchOptions);
        },

        getNextPage: function() {
            Backbone.PageableCollection.prototype
                .getNextPage.call(this, this.fetchOptions);
        },

        getLastPage: function() {
            Backbone.PageableCollection.prototype
                .getLastPage.call(this, this.fetchOptions);
        },

        getCurrentPage: function() {
            return this.state.currentPage;
        },

        getTotalPages: function() {
            return this.state.totalPages;
        }

    });

    var ResultsView = Backbone.View.extend({

        initialize: function() {
            this.listenTo(this.collection, 'reset', this.render);
            this.listenTo(this, 'rendered', this._show);
            this.listenTo(this, 'processing', this._hide);
            this.listenTo(this, 'error', this._hide);
            this.listenTo(this, 'update', this._updateInfo);
        },

        render: function() {
            this._insertRecords();
            this._updateControls();
            this.$('#total-pages').text(this.collection.getTotalPages() || 0);
            this.trigger('rendered');
            return this;
        },

        _insertRecords: function() {
            var tbody = this.$('tbody');
            tbody.empty();
            this.collection.each(function(result, index) {
                var row = $('<tr>');
                _.each(Result.properties, function(name) {
                    row.append($('<td>').text(result.get(name)));
                });
                tbody.append(row);
            }, this);
            if (this.collection.getTotalPages()) {
                this.$('#current-page').text(this.collection.getCurrentPage());
            } else {
                this.$('#current-page').text(0);
            }
        },

        _show: function() {
            this.$el.show(700);
        },

        _hide: function() {
            this.$el.hide();
        },

        _updateInfo: function(info) {
            var $exportInfo = this.$('.data-export-info');
            $exportInfo.empty();
            $exportInfo.append($('<p>').text(info));
        },

        events: {
            'click #first-page': '_firstPage',
            'click #prev-page': '_prevPage',
            'click #next-page': '_nextPage',
            'click #last-page': '_lastPage'
        },

        _firstPage: function() {
            this.collection.getFirstPage();
            this._updateControls();
        },

        _prevPage: function() {
            if (this.collection.hasPreviousPage()) {
                this.collection.getPreviousPage();
            }
            this._updateControls();
        },

        _nextPage: function() {
            if (this.collection.hasNextPage()) {
                this.collection.getNextPage();
            }
            this._updateControls();
        },

        _lastPage: function() {
            this.collection.getLastPage();
            this._updateControls();
        },

        _updateControls: function() {
            var currentPage = this.collection.getCurrentPage(),
                totalPages = this.collection.getTotalPages() || 0,
                backward = ["#first-page", "#prev-page"],
                forward = ["#next-page", "#last-page"];
                this._enable(backward, currentPage > 1);
                this._enable(forward, currentPage < totalPages);
        },

        _enable: function(controls, condition) {
            _.each(controls, function(control) {
                this.$(control).prop('disabled', !condition);
            }, this);
        }

    });

    var resultsView = new ResultsView({
        collection: new Results([]),
        el: $element.find('#results')
    });

    // Status area

    var StatusView = Backbone.View.extend({

        initialize: function() {
            this.listenTo(this, 'processing', this._showSpinner);
            this.listenTo(this, 'notify', this._displayMessage);
            this.listenTo(this, 'stopped', this._empty);
            this.listenTo(resultsView, 'rendered', this._empty);
        },

        _showSpinner: function() {
            this.$el.empty();
            this.$el.append(
                $('<i>').addClass('icon fa fa-spinner fa-spin')
            ).css('text-align', 'center');
        },

        _displayMessage: function(message) {
            this.$el.append($('<p>').text(message));
        },

        _empty: function() {
            this.$el.empty();
        }

    });

    var statusView = new StatusView({
        el: $element.find('.data-export-status')
    });

    // Set up gettext in case it isn't available in the client runtime:
    if (typeof gettext == "undefined") {
        window.gettext = function gettext_stub(string) { return string; };
        window.ngettext = function ngettext_stub(strA, strB, n) { return n == 1 ? strA : strB; };
    }
    var $startButton = $element.find('.data-export-start');
    var $cancelButton = $element.find('.data-export-cancel');
    var $downloadButton = $element.find('.data-export-download');
    var $deleteButton = $element.find('.data-export-delete');
    var $blockTypes = $element.find("select[name='block_types']");
    var $rootBlockId = $element.find("select[name='root_block_id']");
    var $usernames = $element.find("input[name='usernames']");
    var $matchString = $element.find("input[name='match_string']");
    var $resultTable = $element.find('.data-export-results');

    var status;
    function getStatus() {
        $.ajax({
            type: 'POST',
            url: runtime.handlerUrl(element, 'get_status'),
            data: '{}',
            success: updateStatus,
            dataType: 'json'
        });
    }

    function updateStatus(newStatus) {
        var statusChanged = ! _.isEqual(newStatus, status);
        status = newStatus;
        if (status.export_pending) {
            // Keep polling for status updates when an export is running.
            setTimeout(getStatus, 1000);
        }
        if (statusChanged) updateView();
    }

    function disableActions() {
        $startButton.prop('disabled', true);
        $cancelButton.prop('disabled', true);
        $downloadButton.prop('disabled', true);
        $deleteButton.prop('disabled', true);
    }

    function showInfo(info) {
        resultsView.trigger('update', info);
    }

    function showResults() {
        if (status.last_export_result) {
            $resultTable.show();
        }
    }

    function hideResults() {
        resultsView.trigger('processing');
    }

    function showSpinner() {
        statusView.trigger('processing');
    }

    function hideSpinner() {
        statusView.trigger('stopped');
    }

    function showStatusMessage(message) {
        statusView.trigger('notify', message);
    }

    function handleError(data) {
        // Shim to make the XBlock JsonHandlerError response work with our format.
        status = {'last_export_result': JSON.parse(data.responseText), 'export_pending': false};
        updateView();
    }

    function updateView() {
        var startTime;
        $startButton.toggle(!status.export_pending).prop('disabled', false);
        $cancelButton.toggle(status.export_pending).prop('disabled', false);
        $downloadButton.toggle(Boolean(status.download_url)).prop('disabled', false);
        $deleteButton.toggle(Boolean(status.last_export_result)).prop('disabled', false);
        if (status.last_export_result) {
            if (status.last_export_result.error) {
                hideResults();
                hideSpinner();
                showStatusMessage(_.template(
                    gettext('Data export failed. Reason: <%= error %>'),
                    {'error': status.last_export_result.error}
                ));
            } else {
                startTime = new Date(status.last_export_result.start_timestamp * 1000);
                showInfo(
                    _.template(
                        ngettext(
                            'Results retrieved on <%= creation_time %> (<%= seconds %> second).',
                            'Results retrieved on <%= creation_time %> (<%= seconds %> seconds).',
                            status.last_export_result.generation_time_s.toFixed(1)
                        ),
                        {
                            'creation_time': startTime.toString(),
                            'seconds': status.last_export_result.generation_time_s.toFixed(1)
                        }
                    ));
                resultsView.collection.getFirstPage();
            }
        } else {
            if (status.export_pending) {
                showStatusMessage(gettext('The report is currently being generated…'));
            } else {
                hideSpinner();
            }
        }
    }

    function addHandler($button, handlerName, form_submit) {
        $button.on('click', function() {
            var data;
            if (form_submit) {
                data = {
                    block_types: $blockTypes.val(),
                    root_block_id: $rootBlockId.val(),
                    usernames: $usernames.val(),
                    match_string: $matchString.val()
                };
                data = JSON.stringify(data);
            } else {
                data = '{}';
            }
            $.ajax({
                type: 'POST',
                url: runtime.handlerUrl(element, handlerName),
                data: data,
                success: updateStatus,
                error: handleError,
                dataType: 'json'
            });
            showSpinner();
            disableActions();
        });
    }

    addHandler($startButton, 'start_export', true);
    addHandler($cancelButton, 'cancel_export');
    addHandler($deleteButton, 'delete_export');

    $startButton.on('click', hideResults);
    $cancelButton.on('click', showResults);
    $deleteButton.on('click', hideResults);

    $downloadButton.on('click', function() {
        function downloadLink(url, filename) {
            var link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        var downloadReportUrl = runtime.handlerUrl(element, 'download_report');
        downloadLink(downloadReportUrl, 'report.csv');
    });

    showSpinner();
    disableActions();
    getStatus();

}
